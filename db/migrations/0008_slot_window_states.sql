-- 0008_slot_window_states — 비동기 창(B) 슬롯 재활용용 상태 2개 추가.
-- 근거: docs/2 §6(슬롯 재활용 상태머신), docs/6 Phase3, 교차 리뷰(Claude+Codex)에서 상태머신↔CHECK 불일치 P1.
--
-- 0004의 slots_state_check(down|warming|ready|assigned)에 submitting·recycling을 추가한다.
--   · assigned   = 슬롯이 attempt에 배정됨(학생 작업 중). 별도 'active'를 두지 않고 assigned로 통일.
--   · submitting = 제출/개별 마감 → 패키징 Job 진행 중(docs/5 §4).
--   · recycling  = accepted 확정 후 PVC wipe+재시드 중. ⭐ 이 상태에선 배정 금지(앱이 ready만 배정).
--   재활용 흐름(모델 B): ready → assigned → submitting → recycling → ready.
--   모델 A(동시 버스트)는 이 경로를 안 타고 회차 종료에 일괄 scale-down+재시드(docs/2 §6 [close]).
--
-- 인라인 CHECK라 0004에서 이름이 slots_state_check로 자동 생성됨(확인필) → DROP 후 동일 이름으로 재생성.

ALTER TABLE hosted.slots DROP CONSTRAINT slots_state_check;
ALTER TABLE hosted.slots ADD  CONSTRAINT slots_state_check
  CHECK (state IN ('down','warming','ready','assigned','submitting','recycling'));
