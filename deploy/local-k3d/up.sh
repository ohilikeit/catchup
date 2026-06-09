#!/usr/bin/env bash
# local-k3d/up.sh — 로컬 k3d(k3s in docker) + ArgoCD + MinIO 검증 환경 원클릭 부트스트랩.
#
# setup.sh 가 docker-compose(개발 DB/캐시/스토리지) 경로라면, 이 스크립트는 그 위의
# "사내 alpha 와 거의 동일한" k8s 경로다(docs/6 §0.5 local 계층). harbor 없이 `k3d image import`
# 로 이미지를 주입하고, ArgoCD 가 GitHub origin/exp 의 deploy/local-k3d 를 sync 한다(GitOps 루프).
#
# 멱등: 여러 번 돌려도 안전(이미 된 단계는 건너뜀).
# 전제: docker 데몬 실행 중, 외부망(github/ghcr/docker.io pull).
#
# 사용:
#   ./deploy/local-k3d/up.sh                # 전체(도구→클러스터→argocd→이미지→배포)
#   ./deploy/local-k3d/up.sh --no-build     # 이미지 빌드 건너뜀(이미 import 됨)
#   ./deploy/local-k3d/up.sh --no-argocd    # ArgoCD 없이 kubectl apply 직접 배포
set -euo pipefail
cd "$(dirname "$0")/../.."   # 레포 루트

CLUSTER=catchup
NS=catchup-local
BIN="$HOME/.local/bin"
export PATH="$BIN:$PATH"
BUILD=1; ARGOCD=1; NOAPP=0
for a in "$@"; do
  case "$a" in
    --no-build) BUILD=0 ;;
    --no-argocd) ARGOCD=0 ;;
    # --no-app: Application 적용·스택 대기를 건너뛴다. setup.sh 가 secret 을 먼저 만든 뒤 직접 app 을 적용할 때 사용
    #           (secret 이 없는 상태로 워크로드가 뜨면 CreateContainerConfigError 가 나므로 순서를 분리).
    --no-app) NOAPP=1 ;;
  esac
done

b()  { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
err(){ printf '  \033[31m✗\033[0m %s\n' "$*" >&2; }

# ── 0. 도구 설치(~/.local/bin, sudo 불필요) ───────────────────────────────
b "도구 확인/설치 (kubectl·helm·k3d → $BIN)"
mkdir -p "$BIN"
if ! command -v kubectl >/dev/null 2>&1; then
  KVER="$(curl -sL https://dl.k8s.io/release/stable.txt)"
  curl -sL -o "$BIN/kubectl" "https://dl.k8s.io/release/${KVER}/bin/linux/amd64/kubectl"
  chmod +x "$BIN/kubectl"
fi; ok "kubectl $(kubectl version --client -o json 2>/dev/null | grep -o '"gitVersion":"[^"]*"' | head -1)"
if ! command -v helm >/dev/null 2>&1; then
  curl -sL -o /tmp/helm.tgz "https://get.helm.sh/helm-v3.16.4-linux-amd64.tar.gz"
  tar -xzf /tmp/helm.tgz -C /tmp && mv /tmp/linux-amd64/helm "$BIN/helm" && chmod +x "$BIN/helm"
fi; ok "helm $(helm version --short 2>/dev/null)"
if ! command -v k3d >/dev/null 2>&1; then
  curl -sL https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh \
    | TAG=v5.7.5 USE_SUDO=false K3D_INSTALL_DIR="$BIN" bash
fi; ok "k3d $(k3d version 2>/dev/null | head -1)"

# ── 1. k3d 클러스터 ───────────────────────────────────────────────────────
b "k3d 클러스터 '$CLUSTER'"
if k3d cluster list 2>/dev/null | grep -q "^$CLUSTER"; then
  # 재부팅 등으로 멈춰 있으면 start(멱등 — 이미 떠 있으면 no-op). "컴퓨터 켜고 처음" 케이스 대응.
  k3d cluster start "$CLUSTER" >/dev/null 2>&1 || true
  ok "이미 존재 — 기동 보장(start)"
else
  # 호스트 80·8088 둘 다 traefik:80 으로 → http://*.localhost (포트 없는 깔끔한 주소) 사용 가능.
  k3d cluster create "$CLUSTER" --agents 1 -p "80:80@loadbalancer" -p "8088:80@loadbalancer" --wait
  ok "생성 완료"
fi
kubectl config use-context "k3d-$CLUSTER" >/dev/null
kubectl get nodes

# ── 2. 이미지 빌드 + k3d import (레지스트리 우회) ──────────────────────────
if (( BUILD )); then
  b "이미지 빌드 + import (catchup-web / catchup-exam)"
  docker build -f apps/web/Dockerfile -t catchup-web:local .
  docker build -f experiments/s1-docker-spike/exam-image/Dockerfile \
    -t catchup-exam:local experiments/s1-docker-spike/exam-image/
  k3d image import catchup-web:local catchup-exam:local -c "$CLUSTER"
  ok "web·exam 이미지 import 완료"
else
  ok "(--no-build) 이미지 빌드 건너뜀"
fi

# ── 3. ArgoCD 설치 ────────────────────────────────────────────────────────
if (( ARGOCD )); then
  b "ArgoCD 설치 (namespace argocd)"
  kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -
  # server-side: applicationsets CRD 의 큰 annotation 으로 client-side apply 가 실패하는 문제 회피.
  kubectl apply --server-side --force-conflicts -n argocd \
    -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml >/dev/null
  kubectl -n argocd rollout status deploy/argocd-server --timeout=300s
  kubectl -n argocd rollout status deploy/argocd-repo-server --timeout=300s
  ok "ArgoCD 기동 완료"

  b "ArgoCD UI 고정 노출 (http://argocd.localhost) — insecure 모드 + ingress"
  # argocd-server 는 기본 https 리다이렉트 → 평문 ingress 와 충돌. insecure 로 http(:80) 직접 서비스.
  kubectl -n argocd patch configmap argocd-cmd-params-cm --type=merge -p '{"data":{"server.insecure":"true"}}'
  kubectl -n argocd rollout restart deploy/argocd-server
  kubectl -n argocd rollout status deploy/argocd-server --timeout=120s
  kubectl apply -f deploy/local-k3d/argocd-ingress.yaml
  ok "argocd.localhost 준비"

  if (( NOAPP )); then
    ok "(--no-app) Application 적용은 setup.sh 가 secret 생성 후 직접 수행"
  else
    b "ArgoCD Application(catchup-local) 적용 — GitHub origin/exp 의 deploy/local-k3d sync"
    kubectl apply -f deploy/local-k3d/argocd-application.yaml
    ok "Application 적용 (자동 sync·selfHeal)"
  fi
  printf '  admin 암호: '
  kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' 2>/dev/null | base64 -d; echo
else
  b "kubectl 직접 배포 (ArgoCD 없이)"
  kubectl apply -f deploy/local-k3d/ --selector= 2>/dev/null || \
    for f in deploy/local-k3d/[0-9]*.yaml; do kubectl apply -f "$f"; done
  ok "manifest 직접 적용"
fi

# ── 4. 기동 대기 + 안내 ───────────────────────────────────────────────────
# --no-app 이면 워크로드를 아직 안 올렸으므로(setup.sh 가 secret 후 올림) 대기/안내를 건너뛴다.
if (( NOAPP )); then
  b "완료 — 인프라(클러스터·ArgoCD·UI) 준비. 워크로드는 setup.sh 가 secret 생성 후 배포"
  exit 0
fi
b "스택 기동 대기 (postgres·redis·minio·litellm·web)"
kubectl -n "$NS" rollout status deploy/postgres --timeout=180s 2>/dev/null || true
kubectl -n "$NS" rollout status deploy/minio    --timeout=180s 2>/dev/null || true
kubectl -n "$NS" rollout status deploy/web      --timeout=240s 2>/dev/null || true
kubectl -n "$NS" get pods

# ── 5. DB 마이그레이션 (port-forward 경유) ────────────────────────────────
b "DB 마이그레이션 안내"
cat <<EOF
  포트포워드 후 마이그레이션:
    kubectl -n $NS port-forward svc/postgres 5433:5432 &
    DATABASE_URL=postgresql://catchup:catchup@localhost:5433/catchup pnpm db:migrate

  접속 — ingress(traefik, k3d LB :80) 경유:
    http://catchup.localhost    web 앱(메인) — 시험 페이지도 여기 하위(/exam/<id>)
    http://litellm.localhost    litellm 대시보드(로그인: master key)
    http://minio.localhost      minio 콘솔(폴더/객체 열람)
    (*.localhost 는 loopback 으로 해석됨. Windows 브라우저에서 안 되면
     C:\\Windows\\System32\\drivers\\etc\\hosts 에 '127.0.0.1 catchup.localhost litellm.localhost minio.localhost')

  argocd UI 는 https 라 port-forward:
    kubectl -n argocd port-forward svc/argocd-server 8081:443  # https://localhost:8081 (admin)
EOF
b "완료 — local-k3d 환경 기동"
