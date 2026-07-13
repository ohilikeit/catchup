'use server';
import { revalidatePath } from 'next/cache';
import { requireGlobalRole } from '@/lib/auth/guard';
import { batchesRepo } from '@/lib/db';
import * as batchService from '@/lib/services/batchService';
import { parseRosterXlsx } from '@/lib/services/xlsxRoster';
import type { BatchStatus } from '@/lib/db/repositories/batches';

export async function createBatchAction(formData: FormData) {
  const session = await requireGlobalRole('admin');
  const orgId = formData.get('orgId') as string;
  const name = (formData.get('name') as string).trim();
  // 문제 다중 선택(슬롯 여러 개) — 같은 name 의 값을 전부 모아 seq 순서로. 빈 슬롯 제외.
  const problemVersionIds = formData
    .getAll('problemVersionId')
    .map((v) => String(v).trim())
    .filter(Boolean);
  const capacityRaw = formData.get('capacity') as string;
  const capacity = capacityRaw ? Number(capacityRaw) : undefined;

  // 예정 일시(datetime-local) — 빈 값이면 null. 잘못된 값은 거부(서버가 최종 판정).
  const scheduledRaw = (formData.get('scheduledAt') as string | null)?.trim() || '';
  let scheduledAt: Date | null = null;
  if (scheduledRaw) {
    const d = new Date(scheduledRaw);
    if (Number.isNaN(d.getTime())) throw new Error('예정 일시 형식이 올바르지 않습니다.');
    scheduledAt = d;
  }

  // 1인당 LLM 예산(USD) — 빈 값이면 null(상한 없음). 음수/비수 거부.
  const budgetRaw = (formData.get('llmBudgetUsd') as string | null)?.trim() || '';
  let llmBudgetUsd: number | null = null;
  if (budgetRaw) {
    const n = Number(budgetRaw);
    if (!Number.isFinite(n) || n < 0) throw new Error('LLM 예산은 0 이상의 숫자여야 합니다.');
    llmBudgetUsd = n;
  }

  // 워밍 pod 수 — 빈 값이면 null(정원 전체 = 일괄). 범위 검증은 service가 최종 판정.
  const warmRaw = ((formData.get('warmCount') as string | null) ?? '').trim();
  const warmCount = warmRaw === '' ? null : Number(warmRaw);

  // AI 모델 — 빈 값이면 undefined(service가 allowlist[0]로 기본). allowlist 재검증은 service.
  const model = ((formData.get('model') as string | null) ?? '').trim() || undefined;

  // 프롬프트 횟수 제한 — 빈 값이면 30(기본). 음수/비수 방어.
  const quotaRaw = ((formData.get('promptQuota') as string | null) ?? '').trim();
  const promptQuota = quotaRaw === '' ? 30 : (() => {
    const n = Number(quotaRaw);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 30;
  })();

  if (!orgId || !name || problemVersionIds.length === 0) {
    throw new Error('필수 항목을 모두 입력하세요(문제 최소 1개).');
  }

  await batchService.createBatch({ orgId, name, problemVersionIds, capacity, scheduledAt, model, llmBudgetUsd, warmCount, promptQuota });
  revalidatePath('/admin/batches');
}

export async function setBatchStatusAction(id: string, status: BatchStatus) {
  await requireGlobalRole('admin');
  await batchService.setBatchStatus(id, status);
  revalidatePath('/admin/batches');
}

/**
 * 회차 하드 삭제(목록 행) — admin 전역만. service가 "scheduled + 응시 0"을 선판정해 거부 사유를 돌려준다.
 * 결과를 반환해 토스트로 표시(파괴 액션은 사용자에게 결과를 분명히).
 */
export async function deleteBatchAction(id: string): Promise<{ ok: boolean; message: string }> {
  await requireGlobalRole('admin');
  const r = await batchService.deleteBatch(id);
  revalidatePath('/admin/batches');
  return { ok: r.ok, message: r.ok ? '회차를 삭제했습니다.' : (r.error ?? '삭제에 실패했습니다.') };
}

export async function importRosterAction(batchId: string, csvText: string) {
  const session = await requireGlobalRole('admin');

  const batch = await batchesRepo.findById(batchId);
  if (!batch) throw new Error('회차를 찾을 수 없습니다.');

  // CSV 파싱: 헤더 없이 이름,이메일,학번 순
  const rows = csvText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(',').map((p) => p.trim());
      return {
        name: parts[0] ?? '',
        email: parts[1] ?? '',
        externalId: parts[2] || null,
      };
    });

  if (rows.length === 0) throw new Error('유효한 행이 없습니다.');

  const summary = await batchService.importRoster({
    batchId,
    orgId: batch.orgId,
    rows,
    createdBy: session.userId,
  });

  revalidatePath('/admin/batches');
  return summary;
}

/** .xlsx 업로드 → 파싱 → import. FormData의 'file'(.xlsx)을 서버에서 exceljs로 파싱. */
export async function importRosterXlsxAction(batchId: string, formData: FormData) {
  const session = await requireGlobalRole('admin');

  const batch = await batchesRepo.findById(batchId);
  if (!batch) throw new Error('회차를 찾을 수 없습니다.');

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) throw new Error('엑셀 파일을 선택하세요.');

  const { rows, errors } = await parseRosterXlsx(await file.arrayBuffer());
  if (rows.length === 0) {
    throw new Error(`유효한 행이 없습니다. ${errors.slice(0, 3).join(' / ')}`);
  }

  const summary = await batchService.importRoster({
    batchId,
    orgId: batch.orgId,
    rows,
    createdBy: session.userId,
  });

  revalidatePath('/admin/batches');
  // 파싱 경고(누락 행 등)도 함께 반환 — UI에서 표시.
  return { ...summary, parseWarnings: errors };
}
