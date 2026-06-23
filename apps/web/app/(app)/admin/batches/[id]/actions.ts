'use server';
import { revalidatePath } from 'next/cache';
import { requireGlobalRole } from '@/lib/auth/guard';
import { batchesRepo } from '@/lib/db';
import * as batchService from '@/lib/services/batchService';
import * as attemptService from '@/lib/services/attemptService';
import * as examOpsService from '@/lib/services/examOpsService';
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

export interface EnvActionResult {
  ok: boolean;
  message: string;
}

/**
 * 회차 열기 = 시험 환경 provision(가상키·ConfigMap·pod 0→N·슬롯별 라우팅·슬롯 register) 후 status='open'.
 * provision이 실패하면 상태를 바꾸지 않는다 — 슬롯 없는 회차에 학생이 입장하는 일을 막는다.
 * docs/6 Phase 3 "자동 회차 트리거"의 로컬판(web이 k8s API 직접 — ArgoCD 커밋 방식은 alpha부터).
 */
export async function openBatchEnvAction(batchId: string, model: string): Promise<EnvActionResult> {
  await requireGlobalRole('admin');
  try {
    const r = await examOpsService.provisionBatch(batchId, { model });
    await batchService.setBatchStatus(batchId, 'open');
    revalidatePath(`/admin/batches/${batchId}`);
    const warn = r.warnings.length > 0 ? ` ${r.warnings.join(' ')}` : '';
    return { ok: true, message: `슬롯 ${r.slots}개 준비 완료 (문제 ${r.problemCode} · 모델 ${r.model}).${warn}` };
  } catch (e: unknown) {
    revalidatePath(`/admin/batches/${batchId}`);
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 회차 종료 = status='closed'(신규 입장 차단) 후 환경 teardown(pod N→0·라우팅 제거·가상키 revoke·슬롯 down).
 * teardown 실패는 경고로 보고하되 종료 자체는 유지한다(입장 차단이 우선).
 */
export async function closeBatchEnvAction(batchId: string): Promise<EnvActionResult> {
  await requireGlobalRole('admin');
  await batchService.setBatchStatus(batchId, 'closed');
  try {
    const r = await examOpsService.closeBatch(batchId);
    revalidatePath(`/admin/batches/${batchId}`);
    const warn = r.warnings.length > 0 ? ` ${r.warnings.join(' ')}` : '';
    return { ok: true, message: `환경 회수 완료 (가상키 ${r.revokedKeys}개 차단 — 비용은 대시보드에 보존).${warn}` };
  } catch (e: unknown) {
    revalidatePath(`/admin/batches/${batchId}`);
    return {
      ok: false,
      message: `회차는 종료됐지만 환경 회수에 실패했습니다: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * 회차 하드 삭제(상세 Danger Zone) — admin 전역. service가 "scheduled + 응시 0"을 선판정.
 * 성공 시 클라가 목록으로 이동(이 회차 상세는 사라짐).
 */
export async function deleteBatchAction(batchId: string): Promise<EnvActionResult> {
  await requireGlobalRole('admin');
  const r = await batchService.deleteBatch(batchId);
  if (!r.ok) return { ok: false, message: r.error ?? '삭제에 실패했습니다.' };
  revalidatePath('/admin/batches');
  return { ok: true, message: '회차를 삭제했습니다.' };
}

/**
 * 회차 취소(소프트, cancelled) — 이력 있는 회차를 내릴 때. open이면 환경 회수(close)를 먼저 하고
 * cancelled 로 전이한다(진행 중 슬롯·가상키 누수 방지). teardown 실패는 경고로 보고하되 취소는 유지.
 */
export async function cancelBatchAction(batchId: string): Promise<EnvActionResult> {
  await requireGlobalRole('admin');
  const batch = await batchesRepo.findById(batchId);
  if (!batch) return { ok: false, message: '회차를 찾을 수 없습니다.' };
  if (batch.status === 'cancelled') return { ok: false, message: '이미 취소된 회차입니다.' };

  let warn = '';
  if (batch.status === 'open') {
    try {
      const r = await examOpsService.closeBatch(batchId);
      if (r.warnings.length > 0) warn = ` ${r.warnings.join(' ')}`;
    } catch (e: unknown) {
      warn = ` (환경 회수 실패: ${e instanceof Error ? e.message : String(e)})`;
    }
  }
  await batchService.setBatchStatus(batchId, 'cancelled');
  revalidatePath(`/admin/batches/${batchId}`);
  revalidatePath('/admin/batches');
  return { ok: true, message: `회차를 취소했습니다.${warn}` };
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
