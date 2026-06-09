-- 0011_temp_password — 임시비번 평문 보관(관리자 조회·학생 전달용).
-- 근거: docs/1 §2·§4(관리자 사전 발급형 온보딩). 운영 의미:
--   · 로스터/단일추가로 신규 계정 생성 시 임시비번을 평문으로 함께 보관(관리자가 이메일로 전달해야 하므로 상시 조회 필요).
--   · 학생이 본인 비번으로 교체(setPassword)하면 temp_password = NULL → 즉시 폐기(더는 임시비번 아님).
-- ⚠️ 평문 at-rest: "관리자가 발급해 전달하는 1회용 온보딩 비번"이라는 성격상 허용(reference/05).
--    진짜 키·세션 시크릿과 달리 저가치·교체대상. 노출 시 비번 변경으로 무효화.
ALTER TABLE auth.users ADD COLUMN temp_password TEXT;
COMMENT ON COLUMN auth.users.temp_password IS '발급 임시비번 평문(관리자 조회용). 학생 비번 변경 시 NULL.';
