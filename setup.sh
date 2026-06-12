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
#   ./setup.sh                # 전체(도구·클러스터·이미지빌드·argocd·스택·마이그레이션·시드·git훅)
#   ./setup.sh --no-seed      # 데모 시드 건너뜀
#   ./setup.sh --no-build     # 이미지 재빌드 건너뜀(이미 import 됨 — 빠른 재기동)
#   ./setup.sh --no-hook      # exp 커밋→web 자동반영 post-commit 훅 설치 건너뜀
set -euo pipefail
cd "$(dirname "$0")"                 # 레포 루트
export PATH="$HOME/.local/bin:$PATH" # up.sh 가 설치하는 kubectl/helm/k3d 경로

NS=catchup-local
SEED=1
BUILD_FLAG=""
HOOK=1
for a in "$@"; do
  case "$a" in
    --no-seed)  SEED=0 ;;
    --no-build) BUILD_FLAG="--no-build" ;;
    --no-hook)  HOOK=0 ;;
  esac
done

# 색 출력 헬퍼
b() { printf '\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
err() { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; }
step() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }

# Deployment 가 ArgoCD sync 로 '생성'될 때까지 기다린 뒤 rollout 완료를 기다린다.
# kubectl rollout status 는 리소스가 아직 없으면 NotFound 로 즉시 끝나 버려서(레이스),
# Application apply 직후엔 대기 없이 통과 → 버킷 생성·port-forward 가 빈 클러스터에 꽂힌다.
wait_deploy() { # $1=이름 $2=타임아웃(초, 기본 180) — 생성 대기와 rollout 대기에 같은 예산 사용
  local name="$1" timeout="${2:-180}" waited=0
  until kubectl -n "$NS" get deploy "$name" >/dev/null 2>&1; do
    (( waited >= timeout )) && { err "deploy/$name 이 ${timeout}s 내에 생성되지 않음(ArgoCD sync 지연?)"; return 1; }
    sleep 2; (( waited += 2 ))
  done
  kubectl -n "$NS" rollout status deploy/"$name" --timeout="${timeout}s"
}

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

# ── 1. 환경 파일(.env.secret) — 단일 시크릿 소스 ──────────────────────────
# 이 파일 하나가 클러스터 Secret(app-secrets·litellm-secrets)·postgres/minio pod 자격증명·
# 호스트 dev(pnpm dev)·마이그레이션의 유일한 출처다. 누락 키는 멱등 보강(SESSION/INTERNAL 은 무작위).
step ".env.secret 준비 (단일 시크릿 소스)"
if [[ ! -f .env.secret ]]; then
  cp .env.secret.example .env.secret
  ok ".env.secret 생성(.env.secret.example 복제)"
else
  ok ".env.secret 존재 — 누락 키만 보강"
fi
# 키가 없거나 비어 있으면 채운다($2 가 비면 무작위 생성). 멱등.
ensure_key() {
  local k="$1" def="$2" cur
  cur="$(grep -E "^${k}=" .env.secret | tail -1 | cut -d= -f2- || true)"
  [[ -n "${cur//[[:space:]]/}" ]] && return 0
  [[ -z "$def" ]] && def="$(node -e 'console.log(require("crypto").randomBytes(36).toString("base64url"))')"
  if grep -qE "^${k}=" .env.secret; then
    node -e 'const fs=require("fs"),f=".env.secret";let s=fs.readFileSync(f,"utf8");s=s.replace(new RegExp("^"+process.argv[1]+"=.*$","m"),process.argv[1]+"="+process.argv[2]);fs.writeFileSync(f,s)' "$k" "$def"
  else
    printf '%s=%s\n' "$k" "$def" >> .env.secret
  fi
}
ensure_key SESSION_SECRET ""          # 무작위
ensure_key INTERNAL_API_SECRET ""     # 무작위
ensure_key LITELLM_MASTER_KEY sk-master-dev
ensure_key POSTGRES_USER catchup
ensure_key POSTGRES_PASSWORD catchup
ensure_key POSTGRES_DB catchup
ensure_key MINIO_ROOT_USER catchup
ensure_key MINIO_ROOT_PASSWORD catchup-minio
# ANTHROPIC_API_KEY·ARGOCD_ADMIN_PASSWORD 는 비어 있어도 됨(선택) — 보강하지 않는다.
# 불변식 강제: 앱 S3 키 = MinIO 루트 키(드리프트 방지). 한쪽만 바꿔도 자동 일치시킨다.
set_key() { # 항상 덮어쓰기(없으면 추가)
  if grep -qE "^$1=" .env.secret; then
    node -e 'const fs=require("fs"),f=".env.secret";let s=fs.readFileSync(f,"utf8");s=s.replace(new RegExp("^"+process.argv[1]+"=.*$","m"),process.argv[1]+"="+process.argv[2]);fs.writeFileSync(f,s)' "$1" "$2"
  else printf '%s=%s\n' "$1" "$2" >> .env.secret; fi
}
RU="$(grep -E '^MINIO_ROOT_USER=' .env.secret | tail -1 | cut -d= -f2-)"
RP="$(grep -E '^MINIO_ROOT_PASSWORD=' .env.secret | tail -1 | cut -d= -f2-)"
set_key MINIO_ACCESS_KEY "$RU"
set_key MINIO_SECRET_KEY "$RP"
set -a; . ./.env.secret; set +a       # 이후 단계에서 $POSTGRES_USER 등으로 사용
ok ".env.secret 로드 (누락 키 보강 + MinIO 키 일관성 강제)"
# MinIO 정책 가드(서버가 강제): USER≥3, PASSWORD≥8. 위반 시 CrashLoop 대신 즉시 명확히 실패.
if (( ${#MINIO_ROOT_USER} < 3 )); then err "MINIO_ROOT_USER 는 3자 이상이어야 합니다(.env.secret, 현재 ${#MINIO_ROOT_USER}자)"; exit 1; fi
if (( ${#MINIO_ROOT_PASSWORD} < 8 )); then err "MINIO_ROOT_PASSWORD 는 8자 이상이어야 합니다(MinIO 강제; .env.secret, 현재 ${#MINIO_ROOT_PASSWORD}자)"; exit 1; fi

# ── 2. 의존성 설치 (pnpm install) — 이미지 빌드·마이그레이션 양쪽에 필요 ────
step "의존성 설치 (pnpm install)"
pnpm install
ok "워크스페이스 부트스트랩 완료"

# ── 3. k8s 인프라 부트스트랩 (--no-app: secret 을 먼저 만든 뒤 워크로드 배포) ─
# up.sh 가: kubectl/helm/k3d 설치 → 클러스터 create-or-start → 이미지 build+import(레지스트리 우회)
#          → ArgoCD 설치 + UI ingress. Application(워크로드) 은 secret 생성 후 아래에서 적용.
step "k8s 인프라 부트스트랩 (deploy/local-k3d/up.sh --no-app)"
bash deploy/local-k3d/up.sh $BUILD_FLAG --no-app

# ── 3b. 클러스터 시크릿 렌더 (.env.secret → app-secrets·litellm-secrets) ───
# git 에는 secret 값이 없다(01-secrets.yaml 제거). 여기서 .env.secret 으로 생성 →
# ArgoCD 가 관리하지 않으므로 selfHeal 이 덮어쓰지 않는다(로컬판 SealedSecrets, docs/6 §0.5).
# 워크로드(postgres/minio/web/litellm)보다 먼저 만들어야 CreateContainerConfigError 를 피한다.
step "클러스터 시크릿 생성 (.env.secret 단일 소스)"
kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
# app-secrets: 클러스터 내부 host(postgres/redis/minio 서비스명)로 URL 구성.
kubectl -n "$NS" create secret generic app-secrets \
  --from-literal=DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}" \
  --from-literal=REDIS_URL="redis://redis:6379" \
  --from-literal=MINIO_ENDPOINT="minio" \
  --from-literal=MINIO_PORT="9000" \
  --from-literal=MINIO_USE_SSL="false" \
  --from-literal=MINIO_ACCESS_KEY="${MINIO_ROOT_USER}" \
  --from-literal=MINIO_SECRET_KEY="${MINIO_ROOT_PASSWORD}" \
  --from-literal=SESSION_SECRET="${SESSION_SECRET}" \
  --from-literal=LITELLM_MASTER_KEY="${LITELLM_MASTER_KEY}" \
  --from-literal=LITELLM_BASE_URL="http://litellm:4000" \
  --from-literal=INTERNAL_API_SECRET="${INTERNAL_API_SECRET}" \
  --from-literal=POSTGRES_USER="${POSTGRES_USER}" \
  --from-literal=POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
  --from-literal=POSTGRES_DB="${POSTGRES_DB}" \
  --from-literal=MINIO_ROOT_USER="${MINIO_ROOT_USER}" \
  --from-literal=MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD}" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null
# litellm-secrets: 게이트웨이용. litellm 전용 DB(litellm/litellm 고정, postgres-init 가 생성).
kubectl -n "$NS" create secret generic litellm-secrets \
  --from-literal=DATABASE_URL="postgresql://litellm:litellm@postgres:5432/litellm" \
  --from-literal=LITELLM_MASTER_KEY="${LITELLM_MASTER_KEY}" \
  --from-literal=ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null
# ArgoCD 추적 라벨 제거 — 과거 01-secrets.yaml 로 ArgoCD 가 만들었던 흔적을 떼서 prune 대상에서 제외.
# (신규 설치엔 라벨이 없어 무해. setup.sh 가 secret 의 단독 소유자가 된다.)
kubectl -n "$NS" label secret app-secrets litellm-secrets app.kubernetes.io/instance- >/dev/null 2>&1 || true
ok "app-secrets·litellm-secrets 생성 완료"

# ── 3c. ArgoCD admin 암호 고정 (.env.secret ARGOCD_ADMIN_PASSWORD) ─────────
# argocd 의 admin 계정 암호를 bcrypt 로 argocd-secret 에 박는다 → 새 클러스터에도 항상 같은 암호로 로그인.
# 비워두면 ArgoCD 자동생성 암호(argocd-initial-admin-secret) 사용.
step "ArgoCD admin 암호 설정"
if [[ -n "${ARGOCD_ADMIN_PASSWORD:-}" ]]; then
  PATCH="$(NODE_PATH="$PWD/apps/web/node_modules" node -e "const b=require('bcryptjs');console.log(JSON.stringify({stringData:{'admin.password':b.hashSync(process.argv[1],10),'admin.passwordMtime':new Date().toISOString()}}))" "$ARGOCD_ADMIN_PASSWORD")"
  kubectl -n argocd patch secret argocd-secret --type=merge -p "$PATCH" >/dev/null
  kubectl -n argocd rollout restart deploy/argocd-server >/dev/null 2>&1 || true
  kubectl -n argocd rollout status deploy/argocd-server --timeout=120s >/dev/null 2>&1 || true
  ok "ArgoCD admin / .env.secret 의 ARGOCD_ADMIN_PASSWORD 로 고정"
else
  ok "(ARGOCD_ADMIN_PASSWORD 미설정 — argocd-initial-admin-secret 자동 암호 사용)"
fi

# ── 3d. ArgoCD Application 적용 + 스택 기동 대기 ───────────────────────────
step "ArgoCD Application 적용 + 스택 기동 대기"
kubectl apply -f deploy/local-k3d/argocd-application.yaml >/dev/null
wait_deploy postgres 180 || true
wait_deploy minio    180 || true
wait_deploy litellm  180 || true
wait_deploy web      240 || true
# 재실행으로 .env.secret 의 키가 바뀐 경우, 이미 떠 있는 litellm 이 새 ANTHROPIC 키를 집도록 재시작.
# (.env.secret 에 줄 자체가 없을 수 있으므로 :- 로 안전 처리 — set -u 하에서 unbound 방지)
if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
  kubectl -n "$NS" rollout restart deploy/litellm >/dev/null 2>&1 || true
fi
ok "워크로드 배포 완료"

# ── 4. MinIO 버킷 보장 (클러스터 minio pod 안에서 mc) ──────────────────────
# docs/5 §2: scaffold/hidden/artifacts/chatlogs, 전부 private. 앱도 첫 put 에서 ensureBucket 하지만 미리 보장.
step "MinIO 버킷 생성 (cluster)"
wait_deploy minio 180 >/dev/null 2>&1 || true
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

# ── 5. DB 마이그레이션 (클러스터 postgres, port-forward 경유) ──────────────
# 러너는 호스트에서 돌고 DATABASE_URL 인라인 override 로 클러스터 postgres(localhost:5433)를 가리킨다.
# 자격증명은 .env.secret 단일 소스(POSTGRES_*). litellm 전용 DB 는 postgres-init(10-postgres.yaml)이 생성.
step "DB 마이그레이션 (cluster postgres)"
wait_deploy postgres 180 >/dev/null 2>&1 || true
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
  CLUSTER_DB_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:5433/${POSTGRES_DB}"
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

# ── 8. git post-commit 훅 (exp 커밋 → web 자동 재빌드+반영) ────────────────
# 로컬은 "레지스트리 우회" 모델이라 git push 만으론 화면이 안 바뀐다(ArgoCD 는 매니페스트만 sync,
# web 이미지는 catchup-web:local + imagePullPolicy: Never → 노드 containerd 에서 옴). 그래서 코드
# 반영은 build→k3d import→rollout restart(=reload-web.sh)로 한다. 이 훅이 exp 커밋마다 그걸
# 백그라운드로 대신 돌려준다(Bitbucket pipeline 느낌, 단 러너가 이 PC 라 Harbor 불필요).
if (( HOOK )); then
  step "git post-commit 훅 설치 (exp 커밋 시 web 자동 반영)"
  HOOK_DIR="$(git rev-parse --git-path hooks 2>/dev/null || echo .git/hooks)"
  HOOK_FILE="$HOOK_DIR/post-commit"
  MARKER="# CATCHUP-AUTO-RELOAD"
  if [[ -f "$HOOK_FILE" ]] && ! grep -q "$MARKER" "$HOOK_FILE" 2>/dev/null; then
    cp "$HOOK_FILE" "$HOOK_FILE.bak.$(date +%s)" 2>/dev/null || true
    err "기존 post-commit 훅을 .bak 으로 백업하고 교체합니다"
  fi
  mkdir -p "$HOOK_DIR"
  cat > "$HOOK_FILE" <<'HOOK_EOF'
#!/usr/bin/env bash
# CATCHUP-AUTO-RELOAD — exp 커밋 시 web 이미지 자동 재빌드+반영 (setup.sh 가 설치).
# git push 가 아니라 commit 직후 트리거. reload-web.sh 를 백그라운드로 돌려 커밋을 막지 않는다.
# 끄려면: rm "$(git rev-parse --git-path hooks)/post-commit"  (또는 setup.sh --no-hook 로 재생성 방지)
set -euo pipefail
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
[[ "$BRANCH" == "exp" ]] || exit 0
ROOT="$(git rev-parse --show-toplevel)"
# web 이미지에 영향 주는 파일을 건드린 커밋만(문서·배포 yaml 만 바뀌면 스킵 — 무의미한 재빌드 방지).
if ! git diff-tree --no-commit-id --name-only -r HEAD \
     | grep -qE '^(apps/|packages/|pnpm-lock\.yaml|package\.json|pnpm-workspace\.yaml)'; then
  exit 0
fi
LOG="/tmp/catchup-reload-web.log"
{ printf '\n[%s] post-commit reload (exp %s)\n' "$(date '+%F %T')" "$(git rev-parse --short HEAD)"; } >> "$LOG"
nohup "$ROOT/reload-web.sh" >> "$LOG" 2>&1 &
printf '  \033[1;34m▶ web 자동 재빌드 시작(백그라운드)\033[0m — 진행: tail -f %s\n' "$LOG"
HOOK_EOF
  chmod +x "$HOOK_FILE"
  ok "post-commit 훅 설치 — exp 에 apps/·packages/ 변경 커밋 시 web 자동 reload(백그라운드, 로그: /tmp/catchup-reload-web.log)"
else
  ok "(--no-hook) git post-commit 훅 설치 건너뜀"
fi

# ── 완료 안내 ─────────────────────────────────────────────────────────────
b ""
b "✅ 셋업 완료! (k3s + ArgoCD + MinIO + DB + LiteLLM)"
ARGO_PW="$(kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' 2>/dev/null | base64 -d 2>/dev/null || true)"
cat <<EOF

  접속 (ingress, 포트 없이):
    http://catchup.localhost    web 앱(메인). 시험 페이지는 /exam/<attemptId>
    http://litellm.localhost    litellm 대시보드 (로그인: LITELLM_MASTER_KEY=${LITELLM_MASTER_KEY})
    http://minio.localhost      minio 콘솔 (id/pw: ${MINIO_ROOT_USER} / ${MINIO_ROOT_PASSWORD})
    http://argocd.localhost     ArgoCD UI (admin / ${ARGOCD_ADMIN_PASSWORD:-${ARGO_PW:-<kubectl 로 확인>}})

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

  web 코드 반영(로컬은 git push 가 아니라 build→import→restart):
    git commit (exp 브랜치)                      apps/·packages/ 변경 시 자동 reload(post-commit 훅, 백그라운드)
    tail -f /tmp/catchup-reload-web.log          그 자동 reload 진행 로그
    ./reload-web.sh                              수동 반영(워킹트리 그대로 — 커밋 전 변경도 OK)
    ./setup.sh --no-hook                         위 자동 훅 설치 건너뜀

EOF
