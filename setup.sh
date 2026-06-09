#!/usr/bin/env bash
# CatchUP 플랫폼 — 새 PC 원클릭 셋업 (k8s/k3d 전체 환경).
# k3s(k3d) + ArgoCD + MinIO + DB(postgres) + LiteLLM + web/exam 을 한 번에 올린다(docs/6 §0.5 local 계층).
# 사내 alpha 와 *거의 동일한* 환경을, harbor 없이 `k3d image import` + GitHub origin/exp GitOps 로 재현한다.
#
# 멱등: 여러 번 돌려도 안전(이미 된 단계는 건너뜀). 재부팅 후엔 멈춘 클러스터를 자동 start.
# 무엇이 어디서 도나: postgres/redis/minio/litellm/web/exam 은 전부 클러스터 안 pod(ArgoCD 관리).
#   → 호스트 docker 엔 k3d 노드 컨테이너 3개만 보인다(정상).
#
# 사용:
#   ./setup.sh                # 전체(도구·클러스터·이미지빌드·argocd·스택·마이그레이션·시드)
#   ./setup.sh --no-seed      # 데모 시드 건너뜀
#   ./setup.sh --no-build     # 이미지 재빌드 건너뜀(이미 import 됨 — 빠른 재기동)
set -euo pipefail
cd "$(dirname "$0")"                 # 레포 루트
export PATH="$HOME/.local/bin:$PATH" # up.sh 가 설치하는 kubectl/helm/k3d 경로

NS=catchup-local
SEED=1
BUILD_FLAG=""
for a in "$@"; do
  case "$a" in
    --no-seed)  SEED=0 ;;
    --no-build) BUILD_FLAG="--no-build" ;;
  esac
done

# 색 출력 헬퍼
b() { printf '\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
err() { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; }
step() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }

# ── 0. 사전 요구사항 (node·pnpm·docker) — kubectl/helm/k3d 는 up.sh 가 설치 ──
step "사전 요구사항 확인"
if ! command -v node >/dev/null 2>&1; then
  err "Node.js가 없습니다. https://nodejs.org (>=18.18) 설치 후 다시 실행하세요."; exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
NODE_MINOR="$(node -p 'process.versions.node.split(".")[1]')"
if (( NODE_MAJOR < 18 || (NODE_MAJOR == 18 && NODE_MINOR < 18) )); then
  err "Node.js >= 18.18 이 필요합니다(현재 $(node -v))."; exit 1
fi
ok "Node.js $(node -v)"

if ! command -v pnpm >/dev/null 2>&1; then
  err "pnpm이 없습니다. 'corepack enable && corepack prepare pnpm@9.15.9 --activate' 또는 'npm i -g pnpm' 후 다시 실행하세요."; exit 1
fi
ok "pnpm $(pnpm -v)"

if ! command -v docker >/dev/null 2>&1; then
  err "Docker가 없습니다. https://docs.docker.com/get-docker 설치 후 다시 실행하세요."; exit 1
fi
if ! docker info >/dev/null 2>&1; then
  err "Docker 데몬이 실행 중이 아닙니다. Docker Desktop/daemon을 켠 뒤 다시 실행하세요."; exit 1
fi
ok "Docker"

# ── 1. 환경 파일(.env.secret) ─────────────────────────────────────────────
# 클러스터 시크릿은 deploy/local-k3d/01-secrets.yaml 이지만, .env.secret 은 여전히 필요하다:
#  - litellm 실호출용 ANTHROPIC_API_KEY 를 여기서 읽어 클러스터에 주입(§5)
#  - 호스트에서 돌리는 pnpm db:migrate / db:seed 가 dotenv 로 로드(단 DATABASE_URL 은 클러스터용으로 인라인 override)
step ".env.secret 준비"
if [[ -f .env.secret ]]; then
  ok ".env.secret 이미 존재 — 유지"
else
  cp .env.secret.example .env.secret
  SECRET="$(node -e 'console.log(require("crypto").randomBytes(48).toString("base64url"))')"
  node -e '
    const fs = require("fs");
    const f = ".env.secret";
    let s = fs.readFileSync(f, "utf8");
    s = s.replace(/^SESSION_SECRET=.*$/m, "SESSION_SECRET=" + process.argv[1]);
    fs.writeFileSync(f, s);
  ' "$SECRET"
  ok ".env.secret 생성 + SESSION_SECRET 랜덤 발급"
fi

# ── 2. 의존성 설치 (pnpm install) — 이미지 빌드·마이그레이션 양쪽에 필요 ────
step "의존성 설치 (pnpm install)"
pnpm install
ok "워크스페이스 부트스트랩 완료"

# ── 3. k8s 부트스트랩 (k3d 클러스터·이미지·ArgoCD·UI ingress·스택) ─────────
# up.sh 가: kubectl/helm/k3d 설치 → 클러스터 create-or-start → 이미지 build+import(레지스트리 우회)
#          → ArgoCD 설치 + UI ingress(argocd.localhost) → Application(GitOps) → 스택 rollout 대기.
step "k8s 스택 부트스트랩 (deploy/local-k3d/up.sh)"
bash deploy/local-k3d/up.sh $BUILD_FLAG

# ── 4. MinIO 버킷 보장 (클러스터 minio pod 안에서 mc) ──────────────────────
# docs/5 §2: scaffold/hidden/artifacts/chatlogs, 전부 private. 앱도 첫 put 에서 ensureBucket 하지만 미리 보장.
step "MinIO 버킷 생성 (cluster)"
kubectl -n "$NS" rollout status deploy/minio --timeout=180s >/dev/null 2>&1 || true
if kubectl -n "$NS" exec deploy/minio -- sh -c '
  mc alias set lo http://localhost:9000 "${MINIO_ROOT_USER:-catchup}" "${MINIO_ROOT_PASSWORD:-catchup-minio}" >/dev/null 2>&1
  for bk in exam-scaffold exam-hidden exam-artifacts exam-chatlogs; do
    mc mb -p "lo/$bk" >/dev/null 2>&1; mc anonymous set none "lo/$bk" >/dev/null 2>&1
  done
  mc ls lo
' 2>/dev/null | grep -q exam-; then
  ok "버킷 4종 준비(scaffold/hidden/artifacts/chatlogs, 전부 private)"
else
  err "MinIO 버킷 생성 실패 — 앱이 첫 put 에서 자동 생성하므로 치명적 아님(kubectl -n $NS logs deploy/minio)"
fi

# ── 5. LiteLLM 키 주입 (.env.secret → litellm-secrets) ────────────────────
# ANTHROPIC_API_KEY 는 git 에 없다(01-secrets.yaml 에서 제외). 여기서 .env.secret 값을 주입.
# git manifest 에 없으므로 ArgoCD selfHeal 이 이 값을 지우지 않는다(3-way merge).
step "LiteLLM ANTHROPIC 키 주입"
AKEY="$(grep -E '^ANTHROPIC_API_KEY=' .env.secret 2>/dev/null | tail -1 | cut -d= -f2- || true)"
if [[ -n "${AKEY//[[:space:]]/}" ]]; then
  kubectl -n "$NS" patch secret litellm-secrets --type=merge -p "{\"stringData\":{\"ANTHROPIC_API_KEY\":\"${AKEY}\"}}" >/dev/null
  kubectl -n "$NS" rollout restart deploy/litellm >/dev/null
  ok "ANTHROPIC_API_KEY 주입 + litellm 재시작"
else
  ok "(.env.secret 에 ANTHROPIC_API_KEY 없음 — litellm 은 키 없이 기동. 실호출 전 .env.secret 채우고 재실행)"
fi

# ── 6. DB 마이그레이션 (클러스터 postgres, port-forward 경유) ──────────────
# 러너는 호스트에서 돌고 DATABASE_URL 인라인 override 로 클러스터 postgres(localhost:5433)를 가리킨다.
# litellm 전용 DB 는 postgres-init ConfigMap(10-postgres.yaml)이 기동 시 생성(흡수; docs/3 §7).
step "DB 마이그레이션 (cluster postgres)"
kubectl -n "$NS" rollout status deploy/postgres --timeout=180s >/dev/null 2>&1 || true
kubectl -n "$NS" port-forward svc/postgres 5433:5432 >/tmp/catchup-pf-pg.log 2>&1 &
PF_PID=$!
cleanup_pf() { kill "$PF_PID" >/dev/null 2>&1 || true; }
trap cleanup_pf EXIT
# 포트 열릴 때까지 대기
PF_OK=0
for _ in $(seq 1 30); do
  if (exec 3<>/dev/tcp/127.0.0.1/5433) 2>/dev/null; then exec 3>&- 2>/dev/null; PF_OK=1; break; fi
  sleep 1
done
if (( PF_OK )); then
  CLUSTER_DB_URL="postgresql://catchup:catchup@127.0.0.1:5433/catchup"
  DATABASE_URL="$CLUSTER_DB_URL" pnpm db:migrate
  ok "마이그레이션 완료"
  # ── 7. 데모 시드(선택) ──
  if (( SEED )); then
    step "데모 시드 적용 (cluster postgres)"
    DATABASE_URL="$CLUSTER_DB_URL" pnpm db:seed
    ok "데모 데이터 적재 완료"
  else
    printf '\n  (--no-seed: 데모 시드 건너뜀. 나중에: kubectl -n %s port-forward svc/postgres 5433:5432 & DATABASE_URL=%s pnpm db:seed)\n' "$NS" "$CLUSTER_DB_URL"
  fi
else
  err "postgres port-forward 실패 — 수동: kubectl -n $NS port-forward svc/postgres 5433:5432 & DATABASE_URL=postgresql://catchup:catchup@127.0.0.1:5433/catchup pnpm db:migrate"
fi
cleanup_pf; trap - EXIT

# ── 완료 안내 ─────────────────────────────────────────────────────────────
b ""
b "✅ 셋업 완료! (k3s + ArgoCD + MinIO + DB + LiteLLM)"
ARGO_PW="$(kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' 2>/dev/null | base64 -d 2>/dev/null || true)"
cat <<EOF

  접속 (ingress, 포트 없이):
    http://catchup.localhost    web 앱(메인). 시험 페이지는 /exam/<attemptId>
    http://litellm.localhost    litellm 대시보드 (로그인: LITELLM_MASTER_KEY=sk-master-dev)
    http://minio.localhost      minio 콘솔 (id/pw: catchup / catchup-minio)
    http://argocd.localhost     ArgoCD UI (admin / ${ARGO_PW:-<kubectl 로 확인>})

  * Windows 브라우저에서 "연결할 수 없음"이면 hosts 에 추가:
      127.0.0.1  catchup.localhost litellm.localhost minio.localhost argocd.localhost
    (Windows: C:\\Windows\\System32\\drivers\\etc\\hosts / 리눅스·맥: /etc/hosts)

  데모 로그인(stub, 비밀번호 아무 값):
    student1@univ-a.ac.kr (학생) · staff@univ-a.ac.kr (학교담당자) · admin@catchup.io (관리자)

  자주 쓰는 명령:
    kubectl -n $NS get pods                     스택 상태
    kubectl -n argocd get application catchup-local   GitOps sync 상태
    k3d cluster stop catchup / start catchup    클러스터 정지/기동
    ./setup.sh --no-build                       재기동(이미지 재빌드 없이)

EOF
