#!/usr/bin/env bash
# 가상키 1개 발급 — LiteLLM /key/generate (master key로 인증).
# 학생/attempt마다 호출되며, 예산상한·만료·Sonnet-only가 걸린 가상키를 stdout으로 출력한다.
# 진짜 Anthropic 키는 절대 노출되지 않는다(게이트웨이 안에만).
#
# 사용: LITELLM_MASTER_KEY=... scripts/issue-key.sh <attemptId> [budget_usd] [duration]
set -euo pipefail

ATTEMPT="${1:?usage: issue-key.sh <attemptId> [budget_usd] [duration]}"
BUDGET="${2:-5}"            # attempt당 USD 상한 — 초과 시 게이트웨이가 차단
DURATION="${3:-4h}"        # 만료 — 시험 끝나면 자동 폐기
PROXY="${LITELLM_URL:-http://localhost:4000}"
: "${LITELLM_MASTER_KEY:?LITELLM_MASTER_KEY 환경변수 필요}"

# key_alias는 LiteLLM에서 유니크해야 한다(중복 시 400). 재발급 대비 timestamp suffix를 붙인다.
# attempt 추적은 metadata.attempt로 한다(여러 키가 같은 attempt에 속해도 무방).
ALIAS="attempt-${ATTEMPT}-$(date +%s)"
resp=$(curl -sf "$PROXY/key/generate" \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d "{
        \"key_alias\": \"$ALIAS\",
        \"max_budget\": $BUDGET,
        \"budget_duration\": \"$DURATION\",
        \"duration\": \"$DURATION\",
        \"models\": [\"*\"],
        \"metadata\": {\"attempt\": \"$ATTEMPT\"}
      }") || { echo "[issue-key] /key/generate 실패 — proxy가 떴는지, master key가 맞는지 확인" >&2; exit 1; }

# jq 없이 key 추출
token=$(printf '%s' "$resp" | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4)
[ -n "$token" ] || { echo "[issue-key] 응답에서 key를 못 찾음: $resp" >&2; exit 1; }
printf '%s\n' "$token"
