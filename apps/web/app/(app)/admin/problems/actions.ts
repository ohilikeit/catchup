'use server';
import { revalidatePath } from 'next/cache';
import { requireGlobalRole } from '@/lib/auth/guard';
import * as problemService from '@/lib/services/problemService';
import type { UploadFilePart } from '@/lib/services/problemService';

// admin/problems 서버 액션 — 문제 버전 업로드(MinIO). route는 얇게, 검증·적재는 service.
// 로스터 xlsx 업로드(batches/actions.ts)와 동형: requireGlobalRole + FormData File 검증 + arrayBuffer.

async function filePart(value: FormDataEntryValue | null): Promise<UploadFilePart | null> {
  if (!(value instanceof File) || value.size === 0) return null;
  return {
    filename: value.name,
    mime: value.type || null,
    bytes: Buffer.from(await value.arrayBuffer()),
  };
}

/** 문제 + 버전 업로드. scaffold 필수, hidden 선택. 성공 시 목록 재검증. */
export async function uploadProblemAction(formData: FormData) {
  await requireGlobalRole('admin');

  const code = ((formData.get('code') as string) ?? '').trim();
  const roleTrack = ((formData.get('roleTrack') as string) ?? '').trim();
  const title = ((formData.get('title') as string) ?? '').trim();

  const scaffold = await filePart(formData.get('scaffold'));
  if (!scaffold) throw new Error('스캐폴드 파일을 선택하세요.');
  const hidden = await filePart(formData.get('hidden'));

  const result = await problemService.uploadProblemVersion({ code, roleTrack, title, scaffold, hidden });

  revalidatePath('/admin/problems');
  return result;
}
