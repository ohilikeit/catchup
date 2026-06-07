'use server';
import { revalidatePath } from 'next/cache';
import { requireGlobalRole } from '@/lib/auth/guard';
import { batchesRepo } from '@/lib/db';
import * as batchService from '@/lib/services/batchService';
import { parseRosterXlsx } from '@/lib/services/xlsxRoster';
import type { DeliveryMode, BatchStatus } from '@/lib/db/repositories/batches';

export async function createBatchAction(formData: FormData) {
  const session = await requireGlobalRole('admin');
  const orgId = formData.get('orgId') as string;
  const name = (formData.get('name') as string).trim();
  const problemVersionId = formData.get('problemVersionId') as string;
  const deliveryMode = formData.get('deliveryMode') as DeliveryMode;
  const capacityRaw = formData.get('capacity') as string;
  const capacity = capacityRaw ? Number(capacityRaw) : undefined;

  if (!orgId || !name || !problemVersionId || !deliveryMode) {
    throw new Error('필수 항목을 모두 입력하세요.');
  }

  await batchService.createBatch({ orgId, name, problemVersionId, deliveryMode, capacity });
  revalidatePath('/admin/batches');
}

export async function setBatchStatusAction(id: string, status: BatchStatus) {
  await requireGlobalRole('admin');
  await batchService.setBatchStatus(id, status);
  revalidatePath('/admin/batches');
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
    deliveryMode: batch.deliveryMode,
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
    deliveryMode: batch.deliveryMode,
    rows,
    createdBy: session.userId,
  });

  revalidatePath('/admin/batches');
  // 파싱 경고(누락 행 등)도 함께 반환 — UI에서 표시.
  return { ...summary, parseWarnings: errors };
}
