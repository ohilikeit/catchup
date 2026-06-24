import { ok, fail } from '@/lib/http';
import { getSession } from '@/lib/auth/session';
import { getQuotaStatusForExaminee } from '@/lib/services/examService';

// GET /api/exam/[attemptId]/quota — 학생 브라우저 잔량 조회(세션 인증).
// 소유권은 service가 재판정(대원칙 ⑤). internal secret 경로(examOpsService)와 별도.

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { attemptId: string } }) {
  const session = await getSession();
  if (!session) return fail('unauthorized', '로그인이 필요합니다.', 401);

  const result = await getQuotaStatusForExaminee(params.attemptId, session.userId);
  if (!result.ok) {
    return fail('quota_fetch_failed', result.error, 403);
  }
  return ok(result.data);
}
