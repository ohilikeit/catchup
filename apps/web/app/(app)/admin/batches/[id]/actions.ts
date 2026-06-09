'use server';
import { revalidatePath } from 'next/cache';
import { requireGlobalRole } from '@/lib/auth/guard';
import { batchesRepo } from '@/lib/db';
import * as batchService from '@/lib/services/batchService';
import * as attemptService from '@/lib/services/attemptService';
import type { BatchStatus } from '@/lib/db/repositories/batches';

/**
 * 회차에 학생 1명 추가(개설 이후 개별 등록). 일괄 import 와 동일 로직(importRoster 한 행).
 * 신규 계정이면 임시비번 발급 → issued 로 1회 반환(아이디=이메일·비번=임시비번·회차=이 batch attempt).
 * 기존 계정이면 비번 유지하고 이 회차 attempt 만 추가(다회차 누적).
 */
export async function addStudentAction(
  batchId: string,
  input: { name: string; email: string; externalId?: string | null },
) {
  const session = await requireGlobalRole('admin');
  const batch = await batchesRepo.findById(batchId);
  if (!batch) throw new Error('회차를 찾을 수 없습니다.');
  const name = (input.name ?? '').trim();
  const email = (input.email ?? '').trim().toLowerCase();
  if (!name || !email) throw new Error('이름과 이메일을 입력하세요.');
  const summary = await batchService.importRoster({
    batchId,
    orgId: batch.orgId,
    rows: [{ name, email, externalId: input.externalId?.trim() || null }],
    createdBy: session.userId,
  });
  revalidatePath(`/admin/batches/${batchId}`);
  return summary;
}

export async function setBatchStatusAction(batchId: string, status: BatchStatus) {
  await requireGlobalRole('admin');
  await batchService.setBatchStatus(batchId, status);
  revalidatePath(`/admin/batches/${batchId}`);
}

export async function extendDeadlineAction(batchId: string, attemptId: string, minutes: number) {
  const session = await requireGlobalRole('admin');
  const result = await attemptService.extendDeadline(attemptId, minutes, session.userId);
  if (!result.ok) throw new Error(result.error);
  revalidatePath(`/admin/batches/${batchId}`);
}

export async function voidAttemptAction(batchId: string, attemptId: string, reason: string) {
  const session = await requireGlobalRole('admin');
  const result = await attemptService.voidAttempt(attemptId, reason, session.userId);
  if (!result.ok) throw new Error(result.error);
  revalidatePath(`/admin/batches/${batchId}`);
}

export async function forceSubmitAction(batchId: string, attemptId: string) {
  const session = await requireGlobalRole('admin');
  const result = await attemptService.forceSubmit(attemptId, session.userId);
  if (!result.ok) throw new Error(result.error);
  revalidatePath(`/admin/batches/${batchId}`);
}
