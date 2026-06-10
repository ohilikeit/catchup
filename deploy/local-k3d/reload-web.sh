#!/usr/bin/env bash
# local-k3d/reload-web.sh — web 코드 변경을 로컬 k3d 에 즉시 반영하는 트리거.
#
# 왜 필요한가: 로컬은 ArgoCD 가 deploy/local-k3d 의 *매니페스트만* sync 하고, web 이미지는
# catchup-web:local + imagePullPolicy: Never 다. 그래서 코드를 고쳐 git push 해도 화면은
# 안 바뀐다(매니페스트 불변 → ArgoCD no-op, 노드 containerd 의 옛 이미지 그대로). alpha/prod 와
# 달리 로컬은 "레지스트리 우회" 모델이라, 코드 반영은 git push 가 아니라 아래 3단계로 한다:
#   ① docker build  → ② k3d image import(노드 주입)  → ③ kubectl rollout restart.
# exam 이미지는 건드리지 않는다(web 전용). 전체 재빌드/부트스트랩은 setup.sh / up.sh.
#
# 사용:
#   ./deploy/local-k3d/reload-web.sh             # 빌드 + import + 재배포 (코드 변경 후 평소 사용)
#   ./deploy/local-k3d/reload-web.sh --no-build  # 빌드 생략 — 이미 빌드된 이미지로 재배포만
set -euo pipefail
cd "$(dirname "$0")/../.."   # 레포 루트

CLUSTER=catchup
NS=catchup-local
BIN="$HOME/.local/bin"
export PATH="$BIN:$PATH"
BUILD=1
for a in "$@"; do case "$a" in --no-build) BUILD=0 ;; esac; done

b()  { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
err(){ printf '  \033[31m✗\033[0m %s\n' "$*" >&2; }

# ── 0. k3d 컨텍스트 보장(멈춰 있으면 start) ───────────────────────────────
k3d cluster start "$CLUSTER" >/dev/null 2>&1 || true
if ! kubectl config use-context "k3d-$CLUSTER" >/dev/null 2>&1; then
  err "k3d 클러스터 '$CLUSTER' 컨텍스트가 없습니다 — 먼저 ./setup.sh 또는 deploy/local-k3d/up.sh 로 클러스터를 만드세요."
  exit 1
fi

# ── 1. 빌드 ───────────────────────────────────────────────────────────────
if (( BUILD )); then
  b "web 이미지 빌드 (catchup-web:local)"
  docker build -f apps/web/Dockerfile -t catchup-web:local .
  ok "빌드 완료"
else
  if ! docker image inspect catchup-web:local >/dev/null 2>&1; then
    err "catchup-web:local 이미지가 없습니다 — --no-build 없이 한 번 실행해 먼저 빌드하세요."
    exit 1
  fi
  ok "(--no-build) 빌드 생략 — 기존 catchup-web:local 재사용"
fi

# ── 2. import (imagePullPolicy: Never → 노드 containerd 로 주입 필수) ──────
b "k3d image import (호스트 → 노드 containerd)"
k3d image import catchup-web:local -c "$CLUSTER"
ok "import 완료"

# ── 3. rollout restart + 대기 (같은 :local 태그라 restart 로 새 이미지 픽업) ─
b "web rollout restart"
kubectl -n "$NS" rollout restart deploy/web
kubectl -n "$NS" rollout status deploy/web --timeout=300s

NEWPOD="$(kubectl -n "$NS" get pod -l app=web -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)"
ok "web 재배포 완료 — http://catchup.localhost"
printf '  새 pod: %s\n  (브라우저는 Ctrl+Shift+R 하드 새로고침으로 옛 JS 청크 캐시를 비우세요)\n' "$NEWPOD"
