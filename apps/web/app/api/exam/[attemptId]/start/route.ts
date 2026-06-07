import { ok, fail } from '@/lib/http';
import { getSession } from '@/lib/auth/session';
import { startExam } from '@/lib/services/examService';

// POST /api/exam/[attemptId]/start — 시험 시작. 서버가 deadline_at을 박는다(대원칙 ⑤).
// route는 얇게: 세션 게이트 → examService.startExam → 봉투. 소유권·상태는 service가 판정.

export async function POST(_req: Request, { params }: { params: { attemptId: string } }) {
  const session = await getSession();
  if (!session) return fail('unauthorized', '로그인이 필요합니다.', 401);

  const result = await startExam(params.attemptId, session.userId);
  if (!result.ok) {
    return fail('start_failed', result.error ?? '시험을 시작할 수 없습니다.', 409);
  }
  return ok({ deadlineAt: result.deadlineAt });
}
