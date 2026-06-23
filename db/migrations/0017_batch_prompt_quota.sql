-- 0017_batch_prompt_quota — 회차별 프롬프트 횟수 쿼터(docs/batch-prompt-quota).
-- 학생 pod의 UserPromptSubmit 훅이 LiteLLM 경유로 이 값을 조회해 사전 차단.
-- 카운트 = 마지막 quota_reset 이후 attempt_events(type='turn') 행 수.
-- 차단 경계: used >= prompt_quota → blocked(정확히 quota개 허용, quota+1번째 차단).
-- quota_reset 마커는 exam.attempt_events(type='quota_reset') 재사용 — 별도 테이블 불필요.
-- model(0016)과 달리 단순 수치 불변식(>= 0)이므로 DB CHECK 허용(외부 allowlist 의존 없음).
ALTER TABLE exam.batches
  ADD COLUMN prompt_quota INT NOT NULL DEFAULT 30
    CHECK (prompt_quota >= 0);

COMMENT ON COLUMN exam.batches.prompt_quota IS
  '이 회차 학생당 허용 프롬프트(turn) 수. 카운트=마지막 quota_reset 이후 turn 수. limit+1번째부터 사전 차단.';
