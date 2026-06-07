import 'server-only';
import { attemptsRepo } from '../db';
import type { AttemptRuntime } from '../db/repositories/attempts';

// examService — 시험 런타임 비즈니스 로직(소유권·시작·마감). docs/1 §4.
// ⭐ 시각은 서버가 결정한다(클라 입력은 적대적, 대원칙 ⑤): deadline_at은 start 시점에 서버가 박는다.

/** 기본 제한시간(분). 회차 설정 필드가 생기면 batch에서 읽도록 교체. */
export const DEFAULT_DURATION_MIN = 120;

/** 런타임 진입: 소유권 확인된 메타(없으면 null = 404/권한). */
export async function getRuntime(attemptId: string, examineeId: string): Promise<AttemptRuntime | null> {
  return attemptsRepo.findRuntimeForExaminee(attemptId, examineeId);
}

export interface StartResult {
  ok: boolean;
  deadlineAt?: Date;
  error?: string;
}

/** 시험 시작: ready/running → running, 서버가 deadline_at 설정. 소유권·회차상태 확인. */
export async function startExam(attemptId: string, examineeId: string): Promise<StartResult> {
  const rt = await attemptsRepo.findRuntimeForExaminee(attemptId, examineeId);
  if (!rt) return { ok: false, error: '응시를 찾을 수 없거나 권한이 없습니다.' };
  if (rt.status === 'submitted') return { ok: false, error: '이미 제출된 시험입니다.' };
  if (rt.status === 'expired' || rt.status === 'void') return { ok: false, error: '응시할 수 없는 상태입니다.' };
  if (rt.batchStatus !== 'open') return { ok: false, error: '아직 열리지 않은 회차입니다.' };

  // 이미 deadline이 있으면 유지(재시작이 시간을 늘리지 못하게), 없으면 지금 + 기본시간.
  const deadlineAt = rt.deadlineAt ?? new Date(Date.now() + DEFAULT_DURATION_MIN * 60_000);
  const updated = await attemptsRepo.startAttempt(attemptId, deadlineAt);
  if (!updated) return { ok: false, error: '시작에 실패했습니다.' };
  return { ok: true, deadlineAt: updated.deadlineAt ?? deadlineAt };
}
