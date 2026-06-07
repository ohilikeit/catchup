import { ok } from '@/lib/http';
import { clearSessionCookie } from '@/lib/auth/session';

// POST /api/auth/logout — 세션 쿠키 제거.
export async function POST() {
  clearSessionCookie();
  return ok({ ok: true });
}
