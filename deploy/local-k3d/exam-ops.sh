#!/usr/bin/env bash
# exam-ops.sh — 로컬 최소판 exam-ops (회차 provision/close). docs/6 Phase 3 의 수동 트리거 검증용.
#
# 운영(Phase 3)은 컨트롤러가 자동화한다: "회차 열기" → batches/current.yaml 커밋 → ArgoCD 가 replicas 0↔N,
# pod self-register → ready 슬롯 풀. 여기선 그 흐름을 로컬에서 손으로 한 번 돌려 e2e 를 검증한다.
#
#   provision <batchId> [N]  : exam pod N개 띄우고(기본 1), 각 pod 을 ready 슬롯으로 register
#   close                    : exam replicas 0 (회차 종료)
#   slots                    : 현재 슬롯 상태(DB) 조회
#
# 전제: ./setup.sh 로 스택 기동됨. ArgoCD Application 은 exam /spec/replicas 를 ignoreDifferences 로 무시(수동 스케일 허용).
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.local/bin:$PATH"
NS=catchup-local
CMD="${1:-}"; BATCH_ID="${2:-}"; N="${3:-1}"

slots_dump() {
  kubectl -n "$NS" exec deploy/postgres -- psql -U "${POSTGRES_USER:-catchup}" -d "${POSTGRES_DB:-catchup}" -At \
    -c "SELECT batch_id, slot_no, state, endpoint, attempt_id FROM hosted.slots ORDER BY batch_id, slot_no" 2>/dev/null \
    | sed 's/^/  /' || true
}

case "$CMD" in
  provision)
    [ -z "$BATCH_ID" ] && { echo "usage: exam-ops.sh provision <batchId> [N]"; exit 1; }
    echo "▶ exam StatefulSet → $N replicas"
    kubectl -n "$NS" scale statefulset/exam --replicas="$N"
    kubectl -n "$NS" rollout status statefulset/exam --timeout=180s
    echo "▶ ready 슬롯 등록 (batch=$BATCH_ID, slot 0..$((N-1)))"
    for i in $(seq 0 $((N-1))); do
      EP="http://exam-$i.exam.$NS.svc.cluster.local:8080"
      # web pod 안에서 internal API 로 register (web 이 INTERNAL_API_SECRET 을 env 로 가짐).
      kubectl -n "$NS" exec deploy/web -- node -e '
        const [ep,no,batch]=process.argv.slice(1);
        fetch("http://127.0.0.1:3000/api/internal/slots/register",{method:"POST",
          headers:{"content-type":"application/json","x-internal-secret":process.env.INTERNAL_API_SECRET||""},
          body:JSON.stringify({batchId:batch,slotNo:Number(no),endpoint:ep})})
          .then(async r=>console.log("  slot "+no+" → "+ep+"  ["+r.status+"] "+(await r.text())))
          .catch(e=>{console.error("  slot "+no+" 등록 실패:",e.message);process.exit(1)})
      ' "$EP" "$i" "$BATCH_ID"
    done
    echo "✓ provision 완료 — 현재 슬롯:"; slots_dump
    ;;
  close)
    kubectl -n "$NS" scale statefulset/exam --replicas=0
    echo "✓ exam replicas 0 (회차 종료). 슬롯 행은 DB 에 남음(상태 기계상 down 처리는 Phase 3)."
    ;;
  slots)
    echo "현재 슬롯:"; slots_dump
    ;;
  *)
    echo "usage: exam-ops.sh {provision <batchId> [N] | close | slots}"; exit 1;;
esac
