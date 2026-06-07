-- 0006_user_credentials — 임시비번 발급 + 첫 로그인 변경 추적.
-- 근거: docs/1 §2·§4(관리자 사전 발급형 온보딩), reference/05(bcrypt 해시 저장).
-- password_hash는 0002_auth.sql에 이미 존재 → 여기선 "변경 시점"만 추가.
--
-- 운영 의미:
--   · 로스터 import가 신규 계정에 임시비번을 발급(bcrypt 해시로 password_hash에 저장).
--   · password_changed_at IS NULL  = 임시비번 상태(학생이 아직 본인 비번으로 안 바꿈).
--   · 비번 변경 시 password_changed_at = NOW() → "변경 필요" 배너 해제.

ALTER TABLE auth.users ADD COLUMN password_changed_at TIMESTAMPTZ;
