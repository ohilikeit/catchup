import { ok, fail } from '@/lib/http';
import { env } from '@/lib/env';
import * as problemService from '@/lib/services/problemService';
import type { UploadFilePart } from '@/lib/services/problemService';

// POST /api/internal/problems/upload — automation(예: exam-ops·CI)용 문제 업로드.
// admin 폼(admin/problems/actions.ts)과 동일 서비스(uploadProblemVersion)를 호출하되,
// 사람 세션 대신 x-internal-secret 으로 인가한다. scaffold(필수)·hidden(선택)을 multipart 로 받는다.
// scaffold 실체는 MinIO(exam-scaffold/<code>/v<n>/<name>), DB 엔 ref 포인터만(docs/5 §2).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function filePart(value: FormDataEntryValue | null): Promise<UploadFilePart | null> {
  if (!(value instanceof File) || value.size === 0) return null;
  return {
    filename: value.name,
    mime: value.type || null,
    bytes: Buffer.from(await value.arrayBuffer()),
  };
}

export async function POST(req: Request) {
  const secret = req.headers.get('x-internal-secret') ?? '';
  if (!env.internalApiSecret || secret !== env.internalApiSecret) {
    return fail('unauthorized', 'x-internal-secret 헤더가 올바르지 않습니다.', 401);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail('invalid_body', 'multipart/form-data 본문이 필요합니다.');
  }

  const code = ((form.get('code') as string) ?? '').trim();
  const roleTrack = ((form.get('roleTrack') as string) ?? '').trim();
  const title = ((form.get('title') as string) ?? '').trim();
  const scaffold = await filePart(form.get('scaffold'));
  if (!scaffold) return fail('invalid_body', 'scaffold 파일이 필요합니다.');
  const hidden = await filePart(form.get('hidden'));

  try {
    const result = await problemService.uploadProblemVersion({ code, roleTrack, title, scaffold, hidden });
    return ok(result);
  } catch (e) {
    return fail('upload_failed', e instanceof Error ? e.message : '업로드 실패', 400);
  }
}
