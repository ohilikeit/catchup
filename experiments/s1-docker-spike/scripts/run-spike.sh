#!/usr/bin/env bash
# S1 전체 흐름 오케스트레이션 — 한 학생(attempt)을 게이트웨이 경유로 처음부터 끝까지 띄운다.
#   1) litellm-db + proxy 기동           2) proxy 헬스 대기
#   3) 가상키 자동 발급(이게 자동화의 핵심)  4) exam 컨테이너에 가상키 주입해 기동
#
# .env.secret 에 진짜 ANTHROPIC_API_KEY 가 있어야 한다(게이트웨이에만 보관). 없으면 기동 중단.
#
# 사용: scripts/run-spike.sh            (ATTEMPT_ID/PROBLEM_ID 환경변수로 override 가능)
set -euo pipefail
cd "$(dirname "$0")/.."

ATTEMPT="${ATTEMPT_ID:-spike-1}"
PROBLEM="${PROBLEM_ID:-ainc2026}"

# .env.secret 로드(있으면)
if [ -f .env.secret ]; then
  set -a; . ./.env.secret; set +a
fi
: "${LITELLM_MASTER_KEY:=sk-master-dev}"; export LITELLM_MASTER_KEY

# 진짜 Anthropic 키 필수 — 게이트웨이(proxy)에만 보관된다.
: "${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY 필요 — .env.secret에 진짜 키를 넣으세요 (cp .env.secret.example .env.secret)}"
export LITELLM_CONFIG=config.yaml
echo "[run] attempt=$ATTEMPT  problem=$PROBLEM  (Sonnet 강제, 게이트웨이 경유)"

# 1) 게이트웨이 기동
echo "[run] litellm-db + proxy 기동..."
docker compose up -d litellm-db proxy

# 2) proxy 헬스 대기 (LiteLLM /health/liveliness)
echo -n "[run] proxy 헬스 대기"
for i in $(seq 1 60); do
  if curl -sf "http://localhost:${PROXY_PORT:-4000}/health/liveliness" >/dev/null 2>&1; then ok=1; break; fi
  echo -n "."; sleep 2
done
echo
[ "${ok:-}" = 1 ] || { echo "[run] proxy가 안 떴습니다. 로그: docker compose logs proxy" >&2; exit 1; }

# 3) 가상키 자동 발급
echo "[run] 가상키 발급 (attempt=$ATTEMPT, 예산 \$5, 만료 4h, Sonnet-only)..."
TOKEN=$(scripts/issue-key.sh "$ATTEMPT")
echo "[run] 발급됨: ${TOKEN:0:14}…  (이 값이 컨테이너의 ANTHROPIC_AUTH_TOKEN)"

# 4) exam 기동 (가상키 주입)
echo "[run] exam 컨테이너 기동..."
ATTEMPT_AUTH_TOKEN="$TOKEN" ATTEMPT_ID="$ATTEMPT" PROBLEM_ID="$PROBLEM" \
  docker compose up -d exam

cat <<EOF

[run] ✅ 완료
  • 학생 IDE:    http://localhost:${EXAM_PORT:-8080}   (code-server, 문제=$PROBLEM)
  • 게이트웨이:  http://localhost:${PROXY_PORT:-4000}/ui   (LiteLLM Admin UI: 키·spend 모니터링)
  • 모델:        Sonnet 강제( "*"→Sonnet ), 진짜 키는 proxy에만, 컨테이너엔 가상키만

  검증: 컨테이너 터미널에서 'claude' 실행 → 게이트웨이 경유로 응답.
  spend 확인: curl -s http://localhost:${PROXY_PORT:-4000}/key/info -H "Authorization: Bearer \$LITELLM_MASTER_KEY" -G --data-urlencode "key=$TOKEN"
  정리: docker compose down
EOF
