// CatchUP custom server — hosted code-server iframe 의 WebSocket+HTTP 프록시.
//
// 왜 custom server: Next App Router route handler 는 WS upgrade 를 처리하지 못한다.
// code-server 는 터미널·파일워처·실시간 동기화에 WS 가 필수이므로, 여기서 'upgrade' 이벤트를
// 가로채 인증·소유권·마감 게이트를 통과한 요청만 slot endpoint(code-server)로 프록시한다.
// 일반 HTTP 요청과 Next HMR(WS)은 Next 에 그대로 위임한다.
// 근거: docs/2 §2·§6, docs/4 "학생 pod 은 ClusterIP 비노출, 앱이 1:1 프록시로 중계".
//
// ⚠️ HTTP 경로(/exam/[id]/ide/*)는 app/(exam)/.../ide/[[...path]]/route.ts 가 처리한다.
//    이 서버는 그 위에 WS upgrade 처리만 얹는다(같은 게이트 규칙).
//
// ⚠️ 도입(전환) 시점 = Phase 2 (docs/6). 지금은 코드만 준비한다:
//    - 실 code-server 는 ArgoCD 가 관리하는 exam StatefulSet pod 로 뜬다(docs/3 §5).
//      그때 slot.endpoint = pod ClusterIP(exam-N.exam.svc:8080).
//    - 전환: package.json scripts 의 dev/start 를 `node server.mjs` 로 바꾼다.
//      (그 전까지는 표준 `next dev`/`next start` 를 그대로 쓴다 — 회귀 방지)
//    - 실 ws 연결 검증은 code-server pod 가 존재하는 Phase 2(k3d/alpha)에서 수행.

import { createServer } from 'node:http';
import { parse } from 'node:url';
import net from 'node:net';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import next from 'next';
import pg from 'pg';

// next.config.mjs 와 동일하게 모노레포 루트 .env.secret 을 로드(pool·세션 시크릿이
// next 초기화 전에 필요하므로 여기서 명시적으로 읽는다).
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, '../../.env.secret') });

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT ?? 3000);

const app = next({ dev });
const handle = app.getRequestHandler();
const upgradeHandler = app.getUpgradeHandler();

// ── 세션 검증 ── apps/web/lib/auth/session.ts 와 동일 알고리즘(쿠키 = base64url(JSON).HMAC-SHA256).
// next/headers(cookies())는 요청 컨텍스트 밖인 upgrade 핸들러에서 쓸 수 없어 순수 crypto 로 복제한다.
const SESSION_SECRET =
  process.env.SESSION_SECRET || 'dev-insecure-session-secret-do-not-use-in-prod';
const SESSION_COOKIE = 'catchup_session';

function decodeSession(raw) {
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const obj = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof obj?.userId === 'string' ? obj : null;
  } catch {
    return null;
  }
}

function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

const IDE_RE = /^\/exam\/([^/]+)\/ide(?:\/|$)/;

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// ── 수동 WS 프록시(raw TCP 양방향 파이프) ──
// http-proxy 라이브러리는 traefik 뒤에서 upgrade 파이핑이 불안정(502/1006). 대신 code-server 로 직접
// TCP 연결해 원본 upgrade 요청 + head 를 그대로 흘리고 소켓을 양방향 pipe 한다 → web 은 바이트만 중계,
// traefik 은 code-server 의 깔끔한 101 을 받는다. endpoint 는 서버 신뢰값(slot.endpoint), 스킴 http/https 만.
function pipeWebSocket(endpoint, req, clientSocket, head) {
  let target;
  try {
    target = new URL(endpoint);
  } catch {
    return clientSocket.destroy();
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') return clientSocket.destroy();
  const port = Number(target.port) || (target.protocol === 'https:' ? 443 : 80);
  const upstream = net.connect(port, target.hostname, () => {
    // 원본 요청 라인 + 헤더 재구성(클라의 Sec-WebSocket-Key 등 보존). Host 만 target 으로 교체.
    let raw = `GET ${req.url} HTTP/1.1\r\n`;
    for (const [k, v] of Object.entries(req.headers)) {
      if (k.toLowerCase() === 'host') continue;
      for (const val of Array.isArray(v) ? v : [v]) raw += `${k}: ${val}\r\n`;
    }
    raw += `Host: ${target.host}\r\n\r\n`;
    upstream.write(raw);
    if (head && head.length) upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });
  upstream.on('error', () => { if (!clientSocket.destroyed) clientSocket.destroy(); });
  clientSocket.on('error', () => { if (!upstream.destroyed) upstream.destroy(); });
}

// ── WS 게이트: 인증·소유권·상태·마감·슬롯 검사 후 code-server 로 프록시 ──
async function guardAndProxy(attemptId, req, socket, head) {
  const raw = readCookie(req.headers.cookie, SESSION_COOKIE);
  const session = raw ? decodeSession(raw) : null;
  if (!session) return socket.destroy();

  // attempt 소유권 + 상태/마감 + 배정 슬롯 endpoint 를 한 번에 조회(서버 신뢰값).
  const { rows } = await pool.query(
    `SELECT a.examinee_id, a.status, a.deadline_at, s.endpoint
       FROM exam.attempts a
       LEFT JOIN hosted.slots s ON s.attempt_id = a.id
      WHERE a.id = $1`,
    [attemptId],
  );
  const row = rows[0];
  if (!row || row.examinee_id !== session.userId) return socket.destroy();
  if (row.status !== 'running') return socket.destroy();
  if (row.deadline_at && new Date(row.deadline_at).getTime() < Date.now()) return socket.destroy();
  if (!row.endpoint) return socket.destroy();

  // 접두(/exam/<id>/ide) 제거 → code-server 루트 기준 경로(HTTP route 와 동일 규칙).
  req.url = req.url.replace(/^\/exam\/[^/]+\/ide/, '') || '/';
  pipeWebSocket(row.endpoint, req, socket, head);
}

await app.prepare();

const server = createServer((req, res) => handle(req, res, parse(req.url, true)));

server.on('upgrade', (req, socket, head) => {
  const { pathname } = parse(req.url);
  const match = pathname ? IDE_RE.exec(pathname) : null;
  if (!match) {
    // Next HMR(/_next/webpack-hmr) 등 비-IDE upgrade → Next 에 위임
    upgradeHandler(req, socket, head);
    return;
  }
  guardAndProxy(match[1], req, socket, head).catch(() => {
    if (!socket.destroyed) socket.destroy();
  });
});

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`> CatchUP custom server ready on http://localhost:${port} (dev=${dev})`);
});
