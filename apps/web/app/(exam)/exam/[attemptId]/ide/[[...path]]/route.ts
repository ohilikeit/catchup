/**
 * HTTP 역프록시 — hosted code-server iframe 중계.
 * `/exam/[attemptId]/ide/[[...path]]`
 *
 * ⚠️ 핵심 한계: WebSocket 미지원
 * ─────────────────────────────────────────────────────────────────────────
 * Next.js 표준 route handler는 HTTP upgrade 이벤트를 처리하지 못한다.
 * code-server는 터미널·파일워처·실시간 동기화에 WebSocket이 필수이므로
 * 이 HTTP 프록시만으로는 초기 HTML/정적 asset 로드까지만 동작하고
 * 완전한 IDE는 작동하지 않는다.
 * 완전한 WS 프록시는 Phase 2에서 custom server(server.js + http-proxy로
 * `upgrade` 이벤트 처리) 또는 Ingress 레벨 처리로 도입 예정.
 * 근거: docs/3 §2.5, docs/2 §6 "학생 pod은 ClusterIP/headless로 외부 비노출,
 *       앱(web)이 로그인→배정→1:1 프록시로 중계".
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ⚠️ SSRF 방어
 * slot.endpoint 는 DB(hosted.slots)에서 온 서버 신뢰값
 * (exam-ops/register가 채움, 클라 입력 아님)이라 1차 안전하다.
 * 방어적으로 http:/https: 스킴만 허용하고 그 외는 거부한다.
 */

import { getSession } from '@/lib/auth/session';
import { getRuntimeWithSlot } from '@/lib/services/examService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// hop-by-hop 헤더 — RFC 2616 §13.5.1. 프록시가 제거해야 할 헤더 목록.
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
]);

/** 허용 스킴 검증(SSRF 방어: http/https 외 거부). */
function isAllowedEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** 요청 헤더 정리: host 제거, hop-by-hop 제거. 쿠키 전달은 code-server 인증에 불필요하므로 제거. */
function filterRequestHeaders(incoming: Headers): Headers {
  const out = new Headers();
  for (const [key, value] of incoming.entries()) {
    const lower = key.toLowerCase();
    if (lower === 'host') continue; // target host로 자연 설정
    if (HOP_BY_HOP.has(lower)) continue;
    // cookie: code-server는 자체 인증을 쓰지 않으므로 앱 세션 쿠키를 전달하지 않는다.
    // code-server가 쿠키 기반 인증을 요구할 경우 Phase 2에서 별도 토큰 주입으로 대체 예정.
    if (lower === 'cookie') continue;
    out.set(key, value);
  }
  return out;
}

/** 응답 헤더 정리: hop-by-hop 제거 + iframe 임베드 허용. */
function filterResponseHeaders(upstream: Headers): Headers {
  const out = new Headers();
  for (const [key, value] of upstream.entries()) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) continue;
    // ⚠️ fetch()/undici 는 본문을 자동 압축해제한다 — 원본 content-encoding/content-length 를
    // 그대로 전달하면 클라이언트가 이미 해제된 본문을 다시 gunzip 시도해 깨진다(빈 화면).
    // 변환 프록시이므로 둘 다 드롭(브라우저가 평문으로 받게).
    if (lower === 'content-encoding' || lower === 'content-length') continue;
    // code-server가 X-Frame-Options: DENY/SAMEORIGIN을 내릴 수 있음.
    // 같은 오리진(앱 도메인)의 iframe에 임베드하므로 이 헤더를 제거한다.
    if (lower === 'x-frame-options') continue;
    // Content-Security-Policy의 frame-ancestors 지시자가 임베드를 막을 수 있음.
    // CSP 전체를 제거하는 대신, 헤더 자체를 드롭하여 브라우저가 X-Frame-Options 없이 판단하게 함.
    // Phase 2에서는 frame-ancestors를 앱 오리진으로 재설정하는 방식으로 교체 예정.
    if (lower === 'content-security-policy') continue;
    out.set(key, value);
  }
  return out;
}

interface RouteContext {
  params: { attemptId: string; path?: string[] };
}

async function handleProxy(req: Request, context: RouteContext): Promise<Response> {
  const { attemptId, path } = context.params;

  // ── 게이트 1: 인증 ─────────────────────────────────────────────────────
  const session = await getSession();
  if (!session) {
    return new Response('로그인이 필요합니다.', { status: 401 });
  }

  // ── 게이트 2: 소유권 확인 (IDOR 방지: service가 examineeId로 재검사) ────
  const result = await getRuntimeWithSlot(attemptId, session.userId);
  if (!result) {
    return new Response('응시를 찾을 수 없거나 접근 권한이 없습니다.', { status: 404 });
  }
  const { runtime: examRuntime, slot } = result;

  // ── 게이트 3: 진행 중인 응시만 IDE 접근 허용 ────────────────────────────
  if (examRuntime.status !== 'running') {
    return new Response(
      '진행 중인 응시에서만 IDE에 접근할 수 있습니다. (상태: ' + examRuntime.status + ')',
      { status: 403 },
    );
  }

  // ── 게이트 4: 서버 강제 마감 (클라 시계 불신, 서버가 판정) ───────────────
  // docs/4: "마감→iframe 차단". 클라이언트 시계를 신뢰하지 않고 서버가 판정한다.
  if (examRuntime.deadlineAt && examRuntime.deadlineAt.getTime() < Date.now()) {
    return new Response('제한시간이 종료되었습니다. IDE 접근이 차단되었습니다.', { status: 403 });
  }

  // ── 게이트 5: 슬롯 endpoint 확인 ────────────────────────────────────────
  // 현 단계(Phase 1-2): 슬롯 풀 없음 → slot null → 503 정상 경로.
  if (!slot?.endpoint) {
    return new Response(
      '슬롯이 배정되지 않았습니다. 환경 프로비저닝 대기 중입니다.',
      { status: 503 },
    );
  }

  // ── SSRF 방어: 허용 스킴 검증 ────────────────────────────────────────────
  if (!isAllowedEndpoint(slot.endpoint)) {
    return new Response('내부 오류: 유효하지 않은 endpoint 스킴입니다.', { status: 500 });
  }

  // ── HTTP 역프록시 ─────────────────────────────────────────────────────────
  const pathSegments = path && path.length > 0 ? '/' + path.join('/') : '/';
  const originalUrl = new URL(req.url);
  const targetUrl = slot.endpoint.replace(/\/$/, '') + pathSegments + originalUrl.search;

  const method = req.method;
  const hasBody = method !== 'GET' && method !== 'HEAD';

  // duplex:'half' — Node.js fetch에서 요청 body를 스트리밍 전달할 때 필요한 옵션(RFC draft).
  // TypeScript DOM 타입에 아직 포함되지 않아 확장 인터페이스로 선언한다.
  interface FetchInitWithDuplex extends RequestInit {
    duplex?: 'half';
  }

  const fetchInit: FetchInitWithDuplex = {
    method,
    headers: filterRequestHeaders(req.headers),
    redirect: 'manual', // 리다이렉트를 프록시가 그대로 클라이언트에 전달
    ...(hasBody ? { body: req.body, duplex: 'half' as const } : {}),
  };

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(targetUrl, fetchInit);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류';
    return new Response('upstream 연결 실패: ' + message, { status: 502 });
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: filterResponseHeaders(upstreamResponse.headers),
  });
}

export async function GET(req: Request, context: RouteContext): Promise<Response> {
  return handleProxy(req, context);
}

export async function POST(req: Request, context: RouteContext): Promise<Response> {
  return handleProxy(req, context);
}

export async function PUT(req: Request, context: RouteContext): Promise<Response> {
  return handleProxy(req, context);
}

export async function PATCH(req: Request, context: RouteContext): Promise<Response> {
  return handleProxy(req, context);
}

export async function DELETE(req: Request, context: RouteContext): Promise<Response> {
  return handleProxy(req, context);
}

export async function HEAD(req: Request, context: RouteContext): Promise<Response> {
  return handleProxy(req, context);
}
