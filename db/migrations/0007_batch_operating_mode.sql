-- 0007_batch_operating_mode — 운영 모델 2종 이음새(비동기 창 B 기본 / 동시 버스트 A는 값으로).
-- 근거: docs/2 §5·§6(운영 모델 2종·hot/cold path), docs/6 Phase3·횡단원칙, docs/5 §3.
--
-- 설계 의도(왜 지금, 이 컬럼만):
--   · B(비동기 창)를 기본 엔진으로 삼고, A(동시 버스트)는 "코드 변경 없이 mode 값"으로만 켜지게 연다.
--     A = B의 특수 케이스 — 풀=명부·공유 마감·재활용 생략. 분기는 전부 데이터(mode/capacity/deadline)에서 읽는다.
--   · 마감의 정보원은 여전히 attempts.deadline_at(0003). 여기 컬럼은 "입장 창"과 "제한시간 산출"용일 뿐.
--   · capacity(0003, 풀 크기)·attempts.deadline_at(0003, per-attempt)는 이미 일반형 → 재사용, 추가 안 함.
--   · 슬롯 할당은 hot path(DB 트랜잭션 FOR UPDATE SKIP LOCKED, docs/2 §6) — 이 마이그레이션은 batch 메타만 만진다.

ALTER TABLE exam.batches
  -- 운영 모드: window=비동기 창(기본), burst=동시 버스트(A). 하류는 deadline 정책·풀 산정에만 사용.
  ADD COLUMN mode               TEXT NOT NULL DEFAULT 'window'
    CHECK (mode IN ('window','burst')),
  -- 입장 창(B): 이 구간에만 신규 입장(슬롯 할당) 허용. A에선 window_start_at=동시 시작 시각, end는 같거나 NULL.
  --   주의: batches.opened_at/closed_at(0003)은 "회차 운영 lifecycle"이고, 이건 "학생 입장 허용 구간"으로 별개.
  ADD COLUMN window_start_at    TIMESTAMPTZ,
  ADD COLUMN window_end_at      TIMESTAMPTZ,
  -- attempt 제한시간(초): 입장 시 attempts.deadline_at = NOW() + time_limit_seconds 로 산출.
  --   A에서 공유 벽시계 마감을 쓰면 NULL 가능(그땐 회차 일정 기준).
  ADD COLUMN time_limit_seconds INT
    CHECK (time_limit_seconds IS NULL OR time_limit_seconds > 0),
  -- 입장 창 정합: 둘 다 있으면 end >= start.
  ADD CONSTRAINT ck_batch_window
    CHECK (window_start_at IS NULL OR window_end_at IS NULL OR window_end_at >= window_start_at);

COMMENT ON COLUMN exam.batches.mode               IS 'window(비동기 창, 기본) | burst(동시 버스트=A). A는 B의 특수 케이스 — docs/2 §5.';
COMMENT ON COLUMN exam.batches.window_start_at    IS 'B: 입장 창 시작 / A: 동시 시작 시각. (lifecycle opened_at과 별개)';
COMMENT ON COLUMN exam.batches.window_end_at      IS 'B: 입장 마감(이후 신규 입장 불가).';
COMMENT ON COLUMN exam.batches.time_limit_seconds IS 'attempt 제한시간(초). 할당 시 attempts.deadline_at 산출. NULL이면 공유 일정 기준(A).';
