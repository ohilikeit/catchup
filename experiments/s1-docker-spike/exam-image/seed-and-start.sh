#!/usr/bin/env bash
# 컨테이너 entrypoint — seeder + code-server 기동 (docs/2-exam-environment.md §6·§11·§12)
#  1) (root면) bind mount 권한 정리 후 coder로 강등 재실행
#  2) crash-safe seeder: PROBLEM_ID로 scaffold를 /workspace에 시드(lock 있으면 재개, 없으면 wipe+unpack)
#  3) claude code 로그인 상태 점검(방식 C: credentials 주입 여부)
#  4) code-server 기동
set -euo pipefail

WORKSPACE="/home/coder/project"
REGISTRY="/registry"                  # problem-registry(읽기전용 마운트)
ATTEMPT_ID="${ATTEMPT_ID:-spike-unknown}"
PROBLEM_ID="${PROBLEM_ID:-planning-2026-09-A}"

# ── 1) 권한 정리 후 coder로 강등 ───────────────────────────────────────────────
# bind mount는 호스트 소유권을 그대로 들고 온다. uid 1000 정합이면 그대로, 아니면 chown으로 교정.
if [ "$(id -u)" = "0" ]; then
  chown -R coder:coder /home/coder/.claude /home/coder/project 2>/dev/null || true
  exec runuser -u coder -- "$0" "$@"
fi

echo "[s1] attempt=$ATTEMPT_ID problem=$PROBLEM_ID user=$(id -un)"
mkdir -p "$WORKSPACE"

# ── 2) crash-safe seeder (§11) ────────────────────────────────────────────────
# lock 파일은 "이 attempt가 이미 시드됨"의 표식. 크래시 재기동 시 작업물 보존(wipe 금지).
LOCK="$WORKSPACE/.attempt-$ATTEMPT_ID.lock"
SRC="$REGISTRY/$PROBLEM_ID/scaffold"

if [ -f "$LOCK" ]; then
  echo "[seed] lock 존재 → 재개(wipe 금지): $(basename "$LOCK")"
else
  if [ ! -d "$SRC" ]; then
    echo "[seed] ERROR: scaffold 없음 → $SRC (PROBLEM_ID 확인)" >&2
    exit 1
  fi
  echo "[seed] 신규 시드: $PROBLEM_ID → $WORKSPACE (scaffold만 복사, hidden-tests는 절대 미포함 §4)"
  # wipe + unpack. dotfile 포함 전부 삭제 후 scaffold 내용만 채운다.
  find "$WORKSPACE" -mindepth 1 -delete 2>/dev/null || true
  cp -a "$SRC/." "$WORKSPACE/"
  touch "$LOCK"
  echo "[seed] 완료: $(cd "$WORKSPACE" && ls -A | tr '\n' ' ')"
fi

# ── 3) AI 게이트웨이 경유 인증 (LiteLLM 가상키) ───────────────────────────────
# 진짜 Anthropic 키는 게이트웨이(proxy)에만. 컨테이너엔 ANTHROPIC_BASE_URL + 가상키(ANTHROPIC_AUTH_TOKEN)만 주입된다.
# 모델은 게이트웨이에서 "*"→Sonnet으로 강제되므로 컨테이너 설정을 학생이 바꿔도 우회 불가.
if [ -n "${ANTHROPIC_AUTH_TOKEN:-}" ] && [ -n "${ANTHROPIC_BASE_URL:-}" ]; then
  echo "[auth] 게이트웨이 경유: BASE_URL=$ANTHROPIC_BASE_URL, 가상키 주입됨, 모델=${ANTHROPIC_MODEL:-?}"
else
  echo "[auth] ⚠ ANTHROPIC_AUTH_TOKEN/BASE_URL 미설정 — scripts/run-spike.sh로 기동하세요(가상키 자동 발급·주입)."
fi

# ── 4) code-server 기동 ───────────────────────────────────────────────────────
# --auth none: S1 스파이크 전용(로컬 1인). 실제 운영은 앱이 1:1 프록시로 통제한다(§2). 외부 비노출 전제.
echo "[start] code-server :8080 (auth=none — 스파이크 전용, 운영 금지) workspace=$WORKSPACE"
exec code-server --bind-addr 0.0.0.0:8080 --auth none "$WORKSPACE"
