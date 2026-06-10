import { ok, fail } from '@/lib/http';
import { env } from '@/lib/env';
import { withTransaction } from '@/lib/db/pool';
import * as attemptsRepo from '@/lib/db/repositories/attempts';
import * as submissionsRepo from '@/lib/db/repositories/submissions';
import * as slotsRepo from '@/lib/db/repositories/slots';

// POST /api/internal/submissions/package — 패키징 Job(report 컨테이너) 완료 콜백. docs/5 §4.
// 서버 캡처 산출물을 submissions/submission_files에 등록하고 슬롯을 recycling으로 전이.
// sha256·size는 Job(pack 단계)이 PVC에서 직접 산출 — 학생 클라이언트 입력이 아니다(trust='verified' 근거).

export const dynamic = 'force-dynamic';

const SHA256_RE = /^[0-9a-f]{64}$/;

export async function POST(req: Request) {
  const secret = req.headers.get('x-internal-secret') ?? '';
  const expected = env.internalApiSecret;
  if (!expected || secret !== expected) {
    return fail('unauthorized', 'x-internal-secret 헤더가 올바르지 않습니다.', 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', '요청 본문을 JSON으로 파싱할 수 없습니다.');
  }
  const { attemptId, ref, sha256, sizeBytes, chat } = (body ?? {}) as Record<string, unknown>;
  if (typeof attemptId !== 'string' || attemptId.trim() === '') {
    return fail('invalid_body', 'attemptId(string)가 필요합니다.');
  }
  if (typeof ref !== 'string' || ref.trim() === '') {
    return fail('invalid_body', 'ref(string, MinIO 객체 키)가 필요합니다.');
  }
  if (typeof sha256 !== 'string' || !SHA256_RE.test(sha256)) {
    return fail('invalid_body', 'sha256(hex 64자)이 필요합니다.');
  }
  if (!Number.isInteger(sizeBytes) || (sizeBytes as number) < 0) {
    return fail('invalid_body', 'sizeBytes(int >= 0)가 필요합니다.');
  }

  // 채팅 로그(선택) — pod 안에 대화가 없으면 Job이 null로 보낸다.
  let chatFile: { ref: string; sha256: string; sizeBytes: number } | null = null;
  if (chat != null) {
    const c = chat as Record<string, unknown>;
    if (
      typeof c.ref !== 'string' ||
      c.ref.trim() === '' ||
      typeof c.sha256 !== 'string' ||
      !SHA256_RE.test(c.sha256) ||
      !Number.isInteger(c.sizeBytes) ||
      (c.sizeBytes as number) < 0
    ) {
      return fail('invalid_body', 'chat은 {ref, sha256(hex64), sizeBytes(int>=0)} 형식이어야 합니다.');
    }
    chatFile = { ref: c.ref.trim(), sha256: c.sha256, sizeBytes: c.sizeBytes as number };
  }

  const result = await withTransaction(async (client) => {
    const attempt = await attemptsRepo.lockForSubmitTx(client, attemptId.trim());
    if (!attempt) return { ok: false as const, error: '응시를 찾을 수 없습니다.' };
    if (attempt.status !== 'submitted') {
      return { ok: false as const, error: `제출 상태가 아닌 응시(${attempt.status})는 패키징을 등록할 수 없습니다.` };
    }
    const submissionId = await submissionsRepo.upsertPackagedTx(client, attempt.id);
    await submissionsRepo.addPackagedFileTx(client, {
      submissionId,
      kind: 'artifact',
      ref: ref.trim(),
      sha256,
      sizeBytes: sizeBytes as number,
    });
    if (chatFile) {
      await submissionsRepo.addPackagedFileTx(client, { submissionId, kind: 'chat_log', ...chatFile });
    }
    await slotsRepo.markRecyclingTx(client, attempt.id);
    await attemptsRepo.addEventTx(client, attempt.id, 'artifact_packaged', {
      ref: ref.trim(),
      sha256,
      sizeBytes,
      chat: chatFile,
    });
    return { ok: true as const, submissionId };
  });

  if (!result.ok) return fail('package_rejected', result.error);
  return ok({ submissionId: result.submissionId });
}
