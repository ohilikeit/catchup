-- 0004_hosted — hosted 어댑터 전용(별도 schema!)
-- 근거: docs/1 §3·§5, docs/2 §3·§6. BYOD면 이 schema 자체가 안 쓰임 → 코어(exam)는 무변경.
-- slot_no가 attempts에서 빠지고 여기로 격리된 게 핵심: 제공 방식을 코어 밖으로 밀어냄.

CREATE TABLE hosted.slots (
  batch_id          UUID NOT NULL REFERENCES exam.batches(id) ON DELETE CASCADE,
  slot_no           INT  NOT NULL,
  attempt_id        UUID UNIQUE REFERENCES exam.attempts(id),  -- 1 attempt = 1 slot(1:1)
  state             TEXT NOT NULL DEFAULT 'down'
    CHECK (state IN ('down','warming','ready','assigned')),
  endpoint          TEXT,                          -- ClusterIP 내부 주소(학생에게 직접 노출 안 함)
  last_heartbeat_at TIMESTAMPTZ,                   -- 健康 판정 단일 근거(k8s API 회피, docs/2 §6)
  PRIMARY KEY (batch_id, slot_no)
  -- ⚠️ slot.batch_id == attempt.batch_id 일치는 앱 레이어에서 검증(cross-row 불변식)
);

CREATE INDEX idx_slot_state ON hosted.slots(batch_id, state);  -- 'ready 슬롯에만 배정' 폴링용
