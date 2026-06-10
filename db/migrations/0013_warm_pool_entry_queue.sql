-- 0013_warm_pool_entry_queue — 워밍 풀 통합 모델(A=B 단일 엔진·라이브 입장). docs/6 Phase 3, docs/2 §5~§7.
--
-- 설계 의도:
--   · warm_count = "미리(그리고 상시) 띄워둘 여유 pod 수". NULL=capacity ⇒ 지금의 일괄(A).
--     작게 주면 라이브 입장(B) — 모드 분기 코드 없음, 전부 데이터(0007의 원칙 계승).
--   · entry_queue = ready 슬롯이 없을 때의 FIFO 입장 큐. 배정 컨트롤러(reconcile)가
--     ready 슬롯이 생길 때마다 head부터 원자 배정(SKIP LOCKED). 시작 버튼은 git/Helm을 안 만진다.
--   · attempt_id PK = 응시당 대기 1행(중복 등록 멱등). 배정 즉시 행 삭제.

ALTER TABLE exam.batches
  ADD COLUMN warm_count INT
    CHECK (warm_count IS NULL OR warm_count >= 0);

CREATE TABLE hosted.entry_queue (
  attempt_id  UUID PRIMARY KEY REFERENCES exam.attempts(id) ON DELETE CASCADE,
  batch_id    UUID NOT NULL REFERENCES exam.batches(id) ON DELETE CASCADE,
  enqueued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FIFO 머리부터 배정·위치 계산용.
CREATE INDEX idx_entry_queue_batch ON hosted.entry_queue(batch_id, enqueued_at);
