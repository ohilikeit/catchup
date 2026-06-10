#!/usr/bin/env bash
# exam-ops.sh — 회차 환경 CLI(웹 internal API 의 얇은 래퍼). docs/6 Phase 3.
#
# 본체는 web 의 examOpsService 다(관리자 대시보드 "시험 환경 열기/회차 종료"와 동일 코드):
#   provision = 가상키 발급 → PVC wipe → ConfigMap/Secret → StatefulSet 0→N → 슬롯별 Service/Ingress → 슬롯 register
#   close     = StatefulSet N→0 → 슬롯별 라우팅 제거 → 가상키 revoke → 슬롯 전부 down
# 이 스크립트는 web pod 안에서 internal route 를 호출만 한다(INTERNAL_API_SECRET 은 web env 에 있음).
#
#   provision <batchId> [N]  : 회차 환경 열기(N 생략 시 batch.capacity)
#   close <batchId>          : 회차 환경 회수
#   slots                    : 현재 슬롯 상태(DB) 조회
#
# 전제: ./setup.sh 로 스택 기동됨.
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.local/bin:$PATH"
NS=catchup-local
CMD="${1:-}"; BATCH_ID="${2:-}"; N="${3:-}"

slots_dump() {
  kubectl -n "$NS" exec deploy/postgres -- psql -U "${POSTGRES_USER:-catchup}" -d "${POSTGRES_DB:-catchup}" -At \
    -c "SELECT batch_id, slot_no, state, endpoint, attempt_id FROM hosted.slots ORDER BY batch_id, slot_no" 2>/dev/null \
    | sed 's/^/  /' || true
}

# web pod 안에서 internal route 호출(node fetch — web 이 INTERNAL_API_SECRET 을 env 로 가짐).
call_internal() { # $1=path $2=json-body
  kubectl -n "$NS" exec deploy/web -- node -e '
    const [path, body] = process.argv.slice(1);
    fetch("http://127.0.0.1:3000" + path, { method: "POST",
      headers: { "content-type": "application/json", "x-internal-secret": process.env.INTERNAL_API_SECRET || "" },
      body })
      .then(async (r) => { const t = await r.text(); console.log("  [" + r.status + "] " + t); if (!r.ok) process.exit(1); })
      .catch((e) => { console.error("  호출 실패:", e.message); process.exit(1); })
  ' "$1" "$2"
}

case "$CMD" in
  provision)
    [ -z "$BATCH_ID" ] && { echo "usage: exam-ops.sh provision <batchId> [N]"; exit 1; }
    BODY="{\"batchId\":\"$BATCH_ID\"}"
    [ -n "$N" ] && BODY="{\"batchId\":\"$BATCH_ID\",\"n\":$N}"
    echo "▶ provision (web examOpsService 호출)"
    call_internal "/api/internal/exam-ops/provision" "$BODY"
    echo "▶ pod 기동 대기"
    kubectl -n "$NS" rollout status statefulset/exam --timeout=180s || true
    echo "✓ provision 완료 — 현재 슬롯:"; slots_dump
    ;;
  close)
    [ -z "$BATCH_ID" ] && { echo "usage: exam-ops.sh close <batchId>"; exit 1; }
    echo "▶ close (web examOpsService 호출)"
    call_internal "/api/internal/exam-ops/close" "{\"batchId\":\"$BATCH_ID\"}"
    echo "✓ close 완료 — 현재 슬롯:"; slots_dump
    ;;
  slots)
    echo "현재 슬롯:"; slots_dump
    ;;
  *)
    echo "usage: exam-ops.sh {provision <batchId> [N] | close <batchId> | slots}"; exit 1;;
esac
