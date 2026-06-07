import { NextResponse } from 'next/server';
import { ok, fail } from '@/lib/http';
import { getSession } from '@/lib/auth/session';
import { submitByod } from '@/lib/services/submissionService';
import type { SubmissionFileInput } from '@/lib/db/repositories/submissions';

// POST /api/exam/[attemptId]/submit — BYOD 업로드 제출.
// route는 얇게: 세션 게이트 → submissionService.submitByod. 검증·deadline 재판정·적재는 service가 트랜잭션서.
// invalid는 검증오류 배열(details)을 함께 돌려줘야 학생이 고쳐 재업로드할 수 있다.

interface SubmitBody {
  chatLog?: unknown;
  files?: SubmissionFileInput[];
  tool?: string | null;
}

const STATUS: Record<string, number> = { expired: 409, invalid: 422 };

export async function POST(req: Request, { params }: { params: { attemptId: string } }) {
  const session = await getSession();
  if (!session) return fail('unauthorized', '로그인이 필요합니다.', 401);

  let body: SubmitBody;
  try {
    body = (await req.json()) as SubmitBody;
  } catch {
    return fail('bad_request', '잘못된 요청 본문입니다.', 400);
  }

  const result = await submitByod({
    attemptId: params.attemptId,
    examineeId: session.userId,
    chatLog: body.chatLog,
    files: body.files ?? [],
    tool: body.tool ?? null,
  });

  if (result.ok) return ok({ submissionId: result.submissionId });

  // invalid: fail()은 details를 못 담으므로 직접 봉투 + details로 422 반환.
  if (result.code === 'invalid') {
    return NextResponse.json(
      { success: false, error: { code: result.code, message: result.message }, details: result.details ?? [] },
      { status: 422 },
    );
  }
  return fail(result.code, result.message, STATUS[result.code] ?? 400);
}
