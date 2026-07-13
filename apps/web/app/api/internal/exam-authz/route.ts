import { getSession } from '@/lib/auth/session';
import { queryOne } from '@/lib/db/pool';

// GET /api/internal/exam-authz — traefik ForwardAuth 미들웨어가 slotN.catchup.localhost(코드서버 직결)의 모든 요청마다 호출.
// ⭐ subdomain 라우팅(webview 정상화): 슬롯별 서브도메인이라 code-server 가 루트로 서빙 → webview service worker 가
//   올바른 scope·secure context(.localhost=loopback)에서 등록된다. 세션 쿠키는 domain=.catchup.localhost 로 공유돼 전달.
// ⭐ per-slot 격리(docs/2 §6): 호스트의 슬롯 번호(X-Forwarded-Host: slotN.…)가 "그 유저에게 배정된 슬롯"과 일치해야 통과.
//   Ingress가 slotN.<host> → exam-slot-{N}(pod 고정 Service)로 라우팅하므로, 통과 요청은 자기 pod 외엔 닿지 못한다.
// 허용 조건: 로그인 + 그 유저의 'running' 응시 + 'assigned' 슬롯 + slot_no == 서브도메인의 N.
//   200 → traefik이 요청을 code-server로 통과. 401/403 → 차단.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 서브도메인 앞머리에서 슬롯 번호 추출(포트 포함 가능: slot3.catchup.localhost:8088).
const SLOT_HOST_RE = /^slot(\d{1,3})\./;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response('unauthorized', { status: 401 });

  // traefik ForwardAuth는 원 요청 호스트를 X-Forwarded-Host로 전달한다. slotN 서브도메인이 아니면 거부.
  const host = req.headers.get('x-forwarded-host') ?? '';
  const m = SLOT_HOST_RE.exec(host);
  if (!m) return new Response('forbidden', { status: 403 });
  const slotNo = Number(m[1]);

  // 이 유저가 진행 중(running)이고, 배정된 슬롯의 번호가 경로의 N과 일치하나(=정확히 자기 컨테이너).
  const row = await queryOne<{ ok: number }>(
    `SELECT 1 AS ok
       FROM exam.attempts a
       JOIN hosted.slots s ON s.attempt_id = a.id
      WHERE a.examinee_id = $1 AND a.status = 'running'
        AND s.state = 'assigned' AND s.slot_no = $2
      LIMIT 1`,
    [session.userId, slotNo],
  );
  if (!row) return new Response('forbidden', { status: 403 });
  return new Response('ok', { status: 200 });
}
