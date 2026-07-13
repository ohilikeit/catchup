import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { env } from '../env';
import type { GlobalRole, OrgRole } from './roles';

// 세션 = 로그인 후 (전역 역할 + 소속 org/org_role)을 담는 그릇. docs/1 §2 체크리스트.
//
// 쿠키 형식: `base64url(JSON).base64url(HMAC-SHA256)` — ⭐ 서버 시크릿으로 서명해 위조를 차단한다
//   (클라가 examinee_id/role을 조작해 권한 상승하는 경로를 막음 — 대원칙 ⑤, reference/05).
// 비밀번호 검증은 authService.login()에서 bcrypt로 수행한다(여기는 세션 직렬화/서명만 담당).
// 확장 여지: JWT 표준 클레임/리프레시 토큰 — 도입해도 getSession()이 반환하는 Session 모양은
//   유지되므로 페이지/가드는 무변경(경계를 이름으로 — 대원칙 ①).

const COOKIE = 'catchup_session';

export interface SessionOrg {
  orgId: string;
  orgRole: OrgRole;
  orgName: string;
}

export interface Session {
  userId: string;
  email: string | null;
  fullName: string;
  globalRoles: GlobalRole[];
  orgs: SessionOrg[];
  /** 임시비번 상태(첫 로그인 변경 필요). 변경 완료 시 false로 재발급. */
  mustChangePassword?: boolean;
}

function sign(payloadB64: string): string {
  return createHmac('sha256', env.sessionSecret).update(payloadB64).digest('base64url');
}

/** 서명 비교(타이밍 공격 방어). 길이 다르면 즉시 false. */
function verify(payloadB64: string, sig: string): boolean {
  const expected = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function encode(session: Session): string {
  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function decode(raw: string): Session | null {
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null; // 서명 없는(구/위조) 쿠키 거부
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!verify(payload, sig)) return null; // ⭐ 서명 불일치 = 위조 → 거부
  try {
    const obj = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof obj?.userId !== 'string' || !Array.isArray(obj?.globalRoles) || !Array.isArray(obj?.orgs)) {
      return null;
    }
    return obj as Session;
  } catch {
    return null;
  }
}

/** 현재 요청의 세션(없으면 null). 서버 컴포넌트·route handler에서 호출. */
export async function getSession(): Promise<Session | null> {
  const raw = cookies().get(COOKIE)?.value;
  return raw ? decode(raw) : null;
}

// ⭐ 쿠키 domain — SESSION_COOKIE_DOMAIN 이 있으면 그 값(예: '.catchup.localhost')으로 설정해
//   슬롯 IDE 서브도메인(slotN.catchup.localhost)에도 세션 쿠키가 전달된다(webview 를 위한 subdomain 라우팅).
//   미설정이면 host-only(현행) — 하위호환. prod 는 '.<실도메인>'.
const COOKIE_DOMAIN = process.env.SESSION_COOKIE_DOMAIN || undefined;

/** 로그인 성공 시 세션 쿠키 설정(route handler / server action에서). */
export function setSessionCookie(session: Session): void {
  cookies().set(COOKIE, encode(session), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 8, // 8h
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
  });
}

/** 로그아웃. domain 쿠키는 name-only delete 로 안 지워질 수 있어 같은 domain 으로 만료시킨다. */
export function clearSessionCookie(): void {
  cookies().set(COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
  });
}

/** examinee 라벨 등에 쓸 아바타 이니셜. */
export function initialsOf(name: string): string {
  const t = name.trim();
  if (!t) return 'CU';
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length > 1) return ((parts[0] ?? '').charAt(0) + (parts[1] ?? '').charAt(0)).toUpperCase();
  return t.slice(0, 2).toUpperCase();
}
