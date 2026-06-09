-- 0010_batch_llm_budget — 회차별 LLM 예산(가상키 max_budget의 근거)
-- 근거: docs/2 §3(가상키 = 예산·만료), docs/3 §3, docs/6 Phase 1d.
-- 관리자가 회차 개설 시 "1인당 LLM 예산(USD) 상한"을 정한다. 적용 시점은 가상키 발급
-- (/key/generate의 max_budget, Phase 3 exam-ops) — 여기선 회차의 정책값만 보관한다.
-- NULL = 상한 없음(조직/전역 기본을 따름). CHECK로 음수 차단(불변식은 DB가 강제, 대원칙 ②).
ALTER TABLE exam.batches
  ADD COLUMN llm_budget_usd NUMERIC(10,2)
    CHECK (llm_budget_usd IS NULL OR llm_budget_usd >= 0);
