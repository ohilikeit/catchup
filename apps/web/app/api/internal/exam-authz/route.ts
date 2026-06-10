import { getSession } from '@/lib/auth/session';
import { queryOne } from '@/lib/db/pool';

// GET /api/internal/exam-authz — traefik ForwardAuth 미들웨어가 /exam-ide/{slotNo}(코드서버 직결)의 모든 요청마다 호출.
// 같은 도메인(catchup.localhost) 경로라 catchup_session 쿠키가 그대로 전달됨 → 세션 검증 가능.
// ⭐ per-slot 격리(docs/2 §6): 경로의 슬롯 번호(X-Forwarded-Uri)가 "그 유저에게 배정된 슬롯"과 일치해야 통과.
//   Ingress가 /exam-ide/{N} → exam-slot-{N}(pod 고정 Service)로 라우팅하므로,
//   이 검사를 통과한 요청은 자기 pod 외에는 닿을 수 없다(학생 A→B 워크스페이스 차단).
// 허용 조건: 로그인 + 그 유저의 'running' 응시 + 'assigned' 슬롯 + slot_no == 경로의 N.
//   200 → traefik이 요청을 code-server로 통과. 401/403 → 차단.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SLOT_PATH_RE = /^\/exam-ide\/(\d{1,3})(?:[/?]|$)/;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response('unauthorized', { status: 401 });

  // traefik ForwardAuth는 원 요청 경로를 X-Forwarded-Uri로 전달한다. 슬롯 없는 경로(구판 /exam-ide/)는 거부.
  const uri = req.headers.get('x-forwarded-uri') ?? '';
  const m = SLOT_PATH_RE.exec(uri);
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
