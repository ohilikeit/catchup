import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/http';
import { login } from '@/lib/services/authService';
import { setSessionCookie } from '@/lib/auth/session';
import { audiencesOf, homeFor } from '@/lib/auth/roles';

// POST /api/auth/login — { email, password } → 세션 쿠키 설정 + 역할 홈 반환.
// route는 얇게: 검증·세션조립은 authService, 쿠키설정은 session 모듈(reference/01 §5).

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return fail('bad_request', '잘못된 요청 본문입니다.', 400);
  }
  if (!body.email) return fail('bad_request', '이메일이 필요합니다.', 400);

  const result = await login(body.email, body.password ?? '');
  if (!result.ok || !result.session) {
    return fail('unauthorized', result.error ?? '로그인에 실패했습니다.', 401);
  }

  setSessionCookie(result.session);
  const audiences = audiencesOf({
    globalRoles: result.session.globalRoles,
    orgRoles: result.session.orgs.map((o) => o.orgRole),
  });
  return ok({
    home: homeFor(audiences),
    fullName: result.session.fullName,
    mustChangePassword: result.mustChangePassword ?? false,
  });
}
