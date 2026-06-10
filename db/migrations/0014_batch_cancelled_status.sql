-- 0014_batch_cancelled_status — 회차 소프트 취소 상태(삭제 관리). docs/6 Phase 1d, reference/02.
--
-- 설계 의도:
--   · 회차 삭제 정책 = "이력(응시) 없으면 하드 삭제(앱), 있으면 소프트 취소(여기)".
--     RESTRICT 체인(attempts.batch_id RESTRICT)이 이력 있는 회차의 하드 삭제를 이미 막는다 →
--     운영자가 잘못 만든/중단할 회차를 "내릴" 경로로 cancelled 를 연다(목록서 숨김·재사용 방지).
--   · 0003 인라인 CHECK(자동명 batches_status_check) → DROP 후 동일 이름으로 cancelled 포함 재생성(0008 패턴).
--   · cancelled 는 closed 와 같은 종단 상태(opened_at/closed_at 타임스탬프는 setStatus 가 처리).
--   · 학생/대학/문제 삭제는 별도 컬럼 불필요 — 대학=기존 is_active(0002), 문제=기존 is_active(0003),
--     학생=attempt 약한참조라 앱 레이어가 판정(FK 없음). 회차만 종단상태가 없어 이 마이그레이션이 필요.

ALTER TABLE exam.batches DROP CONSTRAINT batches_status_check;
ALTER TABLE exam.batches ADD  CONSTRAINT batches_status_check
  CHECK (status IN ('scheduled','open','closed','cancelled'));

COMMENT ON COLUMN exam.batches.status IS
  'scheduled→open→closed 운영 lifecycle + cancelled(소프트 취소, 0014). 하드 삭제는 scheduled+응시0만(앱).';
