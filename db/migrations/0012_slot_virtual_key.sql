-- 0012_slot_virtual_key — 슬롯별 LiteLLM 가상키 보관.
-- 근거: docs/2 §3(가상키), docs/6 Phase 3(가상키 주입 경로).
-- provision 시 슬롯마다 /key/generate 로 발급한 가상키를 보관한다 — 회차 close 시 일괄 revoke,
-- 추후 spend(/key/info) 관제의 근거. ⚠️ 진짜 Anthropic 키가 아니라 게이트웨이가 발급한
-- 예산제(max_budget)·단명(duration) 키이므로 DB 보관 허용 — 유출 시 게이트웨이에서 즉시 삭제 가능.

ALTER TABLE hosted.slots ADD COLUMN virtual_key TEXT;
