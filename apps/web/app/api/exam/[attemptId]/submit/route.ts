import { ok, fail } from '@/lib/http';
import { getSession } from '@/lib/auth/session';
import { submitExam } from '@/lib/services/examService';

// POST /api/exam/[attemptId]/submit — 학생 자가 제출. running → submitted.
// route는 얇게: 세션 게이트 → examService.submitExam → 봉투. 소유권·상태는 service가 트랜잭션에서 재판정.

export async function POST(_req: Request, { params }: { params: { attemptId: string } }) {
  const session = await getSession();
  if (!session) return fail('unauthorized', '로그인이 필요합니다.', 401);

  const result = await submitExam(params.attemptId, session.userId);
  if (!result.ok) {
    return fail('submit_failed', result.error ?? '제출에 실패했습니다.', 409);
  }
  return ok({ submitted: true });
}
