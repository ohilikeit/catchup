'use server';
import { revalidatePath } from 'next/cache';
import { requireGlobalRole } from '@/lib/auth/guard';
import * as problemService from '@/lib/services/problemService';
import type { UploadFilePart } from '@/lib/services/problemService';

// admin/problems/[code] 서버 액션 — 저장된 스캐폴드 교체(덮어쓰기).
// 업로드 액션(../actions.ts)과 동형: FileLike 구조 체크(Node 18 — File 전역 없음) + service 위임.

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

export interface ReplaceResult {
  ok: boolean;
  message: string;
}

/**
 * 버전의 스캐폴드를 새 파일(zip/tgz)로 교체. 정규화(평탄화·정리) 후 같은 버전의 ref·sha256 갱신.
 * ⚠️ 불변 스냅샷 원칙의 예외(업로드 실수 교정) — 호출 UI가 경고·확인을 거친다.
 */
export async function replaceScaffoldAction(
  versionId: string,
  problemCode: string,
  formData: FormData,
): Promise<ReplaceResult> {
  await requireGlobalRole('admin');

  const value = formData.get('file');
  if (!isFileLike(value) || value.size === 0) {
    return { ok: false, message: '교체할 파일을 선택하세요.' };
  }
  const part: UploadFilePart = {
    filename: value.name,
    mime: value.type || null,
    bytes: Buffer.from(await value.arrayBuffer()),
  };

  try {
    const r = await problemService.overwriteScaffold(versionId, part);
    revalidatePath(`/admin/problems/${encodeURIComponent(problemCode)}`);
    const notes: string[] = [`파일 ${r.normalize.fileCount}개`];
    if (r.normalize.flattened > 0) notes.push(`wrapping 폴더 ${r.normalize.flattened}겹 평탄화`);
    if (r.normalize.droppedJunk > 0) notes.push(`불필요 항목 ${r.normalize.droppedJunk}개 제거`);
    return { ok: true, message: `교체 완료 — ${notes.join(' · ')}. sha256 ${r.sha256.slice(0, 12)}…` };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
