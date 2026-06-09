import 'server-only';
import { attemptsRepo, slotsRepo, withTransaction } from '../db';
import type { AttemptRuntime } from '../db/repositories/attempts';
import type { SlotState } from '../db/repositories/slots';

// examService — 시험 런타임 비즈니스 로직(소유권·시작·마감). docs/1 §4.
// ⭐ 시각은 서버가 결정한다(클라 입력은 적대적, 대원칙 ⑤): deadline_at은 start 시점에 서버가 박는다.

/** 기본 제한시간(분). 회차 설정 필드가 생기면 batch에서 읽도록 교체. */
export const DEFAULT_DURATION_MIN = 120;

/** 런타임 진입: 소유권 확인된 메타(없으면 null = 404/권한). */
export async function getRuntime(attemptId: string, examineeId: string): Promise<AttemptRuntime | null> {
  return attemptsRepo.findRuntimeForExaminee(attemptId, examineeId);
}

export interface SlotInfo {
  slotNo: number;
  endpoint: string | null;
  state: SlotState;
}

export interface RuntimeWithSlot {
  runtime: AttemptRuntime;
  slot: SlotInfo | null;
}

/**
 * 런타임 + 슬롯 정보 통합 조회(iframe endpoint 제공용).
 * 슬롯 없음은 정상(현 로컬/Phase 1-2: 슬롯 인프라 미구성 = slot null).
 */
export async function getRuntimeWithSlot(
  attemptId: string,
  examineeId: string,
): Promise<RuntimeWithSlot | null> {
  const runtime = await attemptsRepo.findRuntimeForExaminee(attemptId, examineeId);
  if (!runtime) return null;
  const slot = await slotsRepo.findActiveSlotByAttempt(attemptId);
  return { runtime, slot };
}

export interface StartResult {
  ok: boolean;
  deadlineAt?: Date;
  error?: string;
}

/**
 * 시험 시작: ready/running → running, 서버가 deadline_at 설정. 소유권·회차상태 확인.
 * 트랜잭션 안에서 attempt 상태 전이 + 슬롯 배정을 원자적으로 처리(docs/2 §6).
 *
 * 슬롯 배정은 best-effort:
 *   - 현 단계(Phase 1-2)는 슬롯 풀이 없으므로 배정 실패(null)여도 시작은 허용.
 *   - Phase 2/3에서 슬롯 풀이 상시 존재하면 배정 필수(slot 없으면 대기)로 강화 예정.
 */
export async function startExam(attemptId: string, examineeId: string): Promise<StartResult> {
  // 트랜잭션 밖: 소유권·상태·batchStatus 확인(읽기 전용 — 빠른 거부).
  const rt = await attemptsRepo.findRuntimeForExaminee(attemptId, examineeId);
  if (!rt) return { ok: false, error: '응시를 찾을 수 없거나 권한이 없습니다.' };
  if (rt.status === 'submitted') return { ok: false, error: '이미 제출된 시험입니다.' };
  if (rt.status === 'expired' || rt.status === 'void') return { ok: false, error: '응시할 수 없는 상태입니다.' };
  if (rt.batchStatus !== 'open') return { ok: false, error: '아직 열리지 않은 회차입니다.' };

  // 이미 deadline이 있으면 유지(재시작이 시간을 늘리지 못하게), 없으면 지금 + 기본시간.
  const deadlineAt = rt.deadlineAt ?? new Date(Date.now() + DEFAULT_DURATION_MIN * 60_000);

  return withTransaction(async (client) => {
    // 1. attempt 상태 전이(ready/running → running).
    const updated = await attemptsRepo.startRunningTx(client, attemptId, deadlineAt);
    if (!updated) return { ok: false, error: '시작에 실패했습니다.' };

    // 2. 슬롯 배정(best-effort): ready 슬롯이 없으면 null이어도 진행.
    //    Phase 2/3에서 슬롯 풀이 상시 존재하면 배정 필수(slot 없으면 대기)로 강화 예정.
    const assigned = await slotsRepo.assignReadySlotTx(client, rt.batchId, attemptId);

    // 3. 감사 이벤트 기록.
    await attemptsRepo.addEventTx(client, attemptId, 'started', {
      slotNo: assigned?.slotNo ?? null,
    });

    return { ok: true, deadlineAt: updated.deadlineAt ?? deadlineAt };
  });
}

export interface SubmitResult {
  ok: boolean;
  error?: string;
}

/**
 * 학생 자가 제출: running → submitted. 소유권·상태를 트랜잭션 안에서 재검사(클라 신뢰 금지).
 * 슬롯은 submitting으로 전이(Phase 3 패키징 Job 토대).
 * ⚠️ 상태 전이만 — 실제 산출물 패키징(hosted 캡처→MinIO)은 Phase 3 exam-ops 소관(docs/6 Phase 3).
 */
export async function submitExam(attemptId: string, examineeId: string): Promise<SubmitResult> {
  return withTransaction(async (client) => {
    const attempt = await attemptsRepo.lockForSubmitTx(client, attemptId);
    if (!attempt) return { ok: false, error: '응시를 찾을 수 없습니다.' };
    if (attempt.examineeId !== examineeId) return { ok: false, error: '권한이 없습니다.' };
    if (attempt.status !== 'running') {
      return { ok: false, error: '진행 중인 시험만 제출할 수 있습니다.' };
    }
    await attemptsRepo.markSubmittedTx(client, attemptId);
    await slotsRepo.markSubmittingTx(client, attemptId);
    await attemptsRepo.addEventTx(client, attemptId, 'submitted', { by: 'examinee' });
    return { ok: true };
  });
}
