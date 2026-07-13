'use server';
import { revalidatePath } from 'next/cache';
import { requireGlobalRole } from '@/lib/auth/guard';
import * as problemService from '@/lib/services/problemService';
import type { UploadFilePart } from '@/lib/services/problemService';

// admin/problems 서버 액션 — 문제 버전 업로드(MinIO). route는 얇게, 검증·적재는 service.
// 로스터 xlsx 업로드(batches/actions.ts)와 동형: requireGlobalRole + FormData File 검증 + arrayBuffer.

// ⚠️ Node 18 런타임에는 `File` 전역이 없다(Node 20+). instanceof File 대신 구조적 체크.
interface FileLike {
  name: string;
  size: number;
  type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}
function isFileLike(v: FormDataEntryValue | null): v is FileLike & FormDataEntryValue {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as FileLike).arrayBuffer === 'function' &&
    typeof (v as FileLike).name === 'string'
  );
}

async function filePart(value: FormDataEntryValue | null): Promise<UploadFilePart | null> {
  if (!isFileLike(value) || value.size === 0) return null;
  return {
    filename: value.name,
    mime: value.type || null,
    bytes: Buffer.from(await value.arrayBuffer()),
  };
}

/** 문제 + 버전 업로드. scaffold 필수. 성공 시 목록 재검증. */
export async function uploadProblemAction(formData: FormData) {
  await requireGlobalRole('admin');

  const code = ((formData.get('code') as string) ?? '').trim();
  const roleTrack = ((formData.get('roleTrack') as string) ?? '').trim();
  const title = ((formData.get('title') as string) ?? '').trim();

  const scaffold = await filePart(formData.get('scaffold'));
  if (!scaffold) throw new Error('스캐폴드 파일을 선택하세요.');

  const result = await problemService.uploadProblemVersion({ code, roleTrack, title, scaffold });

  revalidatePath('/admin/problems');
  return result;
}
