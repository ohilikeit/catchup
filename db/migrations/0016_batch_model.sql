-- 0016_batch_model — 회차별 AI 모델 선택(docs/11).
-- 관리자가 회차 생성 시 모델을 지정하고 "시험 환경 열기"에서 재확인한다. provision 이 이 값을
-- 가상키(models 제한)·exam-batch ConfigMap(ANTHROPIC_MODEL)·exam-claude-config(피커)에 주입한다.
-- ⭐ 허용 목록(allowlist)은 deploy config(helm allowedModels → litellm /v1/models)라 DB CHECK 로 박지
--    않는다(설정-DB 결합 회피). 멤버십 검증은 앱 레이어(서버측 재판단, 대원칙 5⑤).
-- DEFAULT 는 안전 기준값 — 기존 회차/구코드는 이 컬럼을 몰라도 haiku 로 동작(호환).
ALTER TABLE exam.batches
  ADD COLUMN model TEXT NOT NULL DEFAULT 'claude-haiku-4-5';

COMMENT ON COLUMN exam.batches.model IS
  '이 회차의 AI 모델(litellm model_name = exam ANTHROPIC_MODEL = 피커 모델). allowlist 검증은 앱.';
