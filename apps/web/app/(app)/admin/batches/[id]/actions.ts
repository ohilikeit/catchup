'use server';
import { revalidatePath } from 'next/cache';
import { requireGlobalRole } from '@/lib/auth/guard';
import * as batchService from '@/lib/services/batchService';
import * as attemptService from '@/lib/services/attemptService';
import type { BatchStatus } from '@/lib/db/repositories/batches';

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
