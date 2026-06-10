import 'server-only';
import { withTransaction } from '../db';
import * as attemptsRepo from '../db/repositories/attempts';
import * as usersRepo from '../db/repositories/users';
import * as slotsRepo from '../db/repositories/slots';
import { triggerPackaging } from './examService';
import { myOrgAdminIds } from '../auth/guard';
import type { Session } from '../auth/session';
import type { AttemptDetail, AttemptEvent } from '../db/repositories/attempts';
import type { User } from '../db/repositories/users';
import type { MyExamItem } from '../db/repositories/attempts';

// attemptService — 응시 상세 읽기(소유권·org 스코프 강제) + 관리자 운영 액션(연장/무효).
// ⭐ IDOR 방지: 모든 [id] 조회는 fetch 후 소유권/스코프를 service가 재검사한다(클라 신뢰 금지).

/** 학생 본인 리포트용: 소유권(examinee 일치) 확인된 상세. 아니면 null. */
export async function getReportForExaminee(session: Session, attemptId: string): Promise<AttemptDetail | null> {
  const detail = await attemptsRepo.findDetailById(attemptId);
  if (!detail || detail.examineeId !== session.userId) return null;
  return detail;
}

/** 관리자 운영 뷰: 상세 + 감사 타임라인. (admin 권한은 호출부 라우트/액션이 보장) */
export async function getOpsView(attemptId: string): Promise<{ detail: AttemptDetail; events: AttemptEvent[] } | null> {
  const detail = await attemptsRepo.findDetailById(attemptId);
  if (!detail) return null;
  const events = await attemptsRepo.listEvents(attemptId);
  return { detail, events };
}

/** org_admin 학생 상세: 학생이 viewer의 org에 소속됐는지 확인 후 사용자 + 응시 이력. */
export async function getStudentForOrg(
  session: Session,
  userId: string,
): Promise<{ user: User; attempts: MyExamItem[] } | null> {
  const orgIds = myOrgAdminIds(session);
  const allowed = session.globalRoles.includes('admin') || (await usersRepo.isExamineeInOrgs(userId, orgIds));
  if (!allowed) return null;
  const user = await usersRepo.findById(userId);
  if (!user) return null;
  const attempts = await attemptsRepo.listByExaminee(userId);
  return { user, attempts };
}

export type OpsResult = { ok: true } | { ok: false; error: string };

/** 운영: 마감 연장(분). 기준 = max(현재시각, 기존 마감) + minutes. 이벤트 기록. */
export async function extendDeadline(attemptId: string, minutes: number, actorId: string): Promise<OpsResult> {
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 600) {
    return { ok: false, error: '연장 시간은 1~600분 사이여야 합니다.' };
  }
  return withTransaction(async (client) => {
    const attempt = await attemptsRepo.lockForSubmitTx(client, attemptId);
    if (!attempt) return { ok: false, error: '응시를 찾을 수 없습니다.' };
    const base = attempt.deadlineAt && attempt.deadlineAt.getTime() > Date.now() ? attempt.deadlineAt.getTime() : Date.now();
    const newDeadline = new Date(base + minutes * 60_000);
    const ok = await attemptsRepo.extendDeadlineTx(client, attemptId, newDeadline);
    if (!ok) return { ok: false, error: '이미 제출/만료/무효된 응시는 연장할 수 없습니다.' };
    await attemptsRepo.addEventTx(client, attemptId, 'deadline_extended', {
      minutes,
      newDeadline: newDeadline.toISOString(),
      by: actorId,
    });
    return { ok: true };
  });
}

/** 운영: 강제 제출. ready/running 응시를 즉시 submitted로 마감. 이미 제출/만료/무효면 거부. 이벤트 기록.
 * 커밋 후 패키징 Job(PVC 캡처→MinIO)을 fail-soft로 생성 — 슬롯 미배정(ready) 응시는 자동 생략. */
export async function forceSubmit(attemptId: string, actorId: string): Promise<OpsResult> {
  const result = await withTransaction<OpsResult>(async (client) => {
    const attempt = await attemptsRepo.lockForSubmitTx(client, attemptId);
    if (!attempt) return { ok: false, error: '응시를 찾을 수 없습니다.' };
    const ok = await attemptsRepo.forceSubmitTx(client, attemptId);
    if (!ok) return { ok: false, error: '대기/진행 중인 응시만 강제 제출할 수 있습니다.' };
    await slotsRepo.markSubmittingTx(client, attemptId);
    await attemptsRepo.addEventTx(client, attemptId, 'force_submitted', {
      from: attempt.status,
      by: actorId,
    });
    return { ok: true };
  });

  if (result.ok) await triggerPackaging(attemptId);
  return result;
}

/** 운영: 응시 무효(void). 제출 완료건은 불가. 이벤트 기록. */
export async function voidAttempt(attemptId: string, reason: string, actorId: string): Promise<OpsResult> {
  return withTransaction(async (client) => {
    const ok = await attemptsRepo.voidAttemptTx(client, attemptId);
    if (!ok) return { ok: false, error: '제출 완료된 응시는 무효 처리할 수 없습니다.' };
    await attemptsRepo.addEventTx(client, attemptId, 'voided', { reason: reason || null, by: actorId });
    return { ok: true };
  });
}
