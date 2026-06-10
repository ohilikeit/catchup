import { ok, fail } from '@/lib/http';
import { getSession } from '@/lib/auth/session';
import { expireExam } from '@/lib/services/examService';

// POST /api/exam/[attemptId]/expire — 학생 화면 카운트다운 만료(onExpire) 콜백.
// route는 얇게: 세션 게이트 → examService.expireExam. ⭐ 마감 여부는 service가 서버 시각으로
// 재판정한다(클라가 일찍 불러도 deadline 안 지났으면 collected=false). 누락 안전망은 close 스윕.

export async function POST(_req: Request, { params }: { params: { attemptId: string } }) {
  const session = await getSession();
  if (!session) return fail('unauthorized', '로그인이 필요합니다.', 401);

  const result = await expireExam(params.attemptId, session.userId);
  if (!result.ok) return fail('expire_failed', result.error ?? '마감 처리에 실패했습니다.', 409);
  return ok({ collected: result.collected ?? false });
}
