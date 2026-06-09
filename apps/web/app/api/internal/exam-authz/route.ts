import { getSession } from '@/lib/auth/session';
import { queryOne } from '@/lib/db/pool';

// GET /api/internal/exam-authz — traefik ForwardAuth 미들웨어가 /exam-ide(코드서버 직결) 의 모든 요청마다 호출.
// 같은 도메인(catchup.localhost) 경로라 catchup_session 쿠키가 그대로 전달됨 → 세션 검증 가능.
// 허용 조건: 로그인 + 그 유저가 'running' 응시 + 배정된 슬롯(자기 컨테이너) 보유.
//   200 → traefik 이 요청을 code-server 로 통과. 401/403 → 차단.
// ⚠️ 로컬 단일 pod 기준 권한(그 유저가 진행 중 시험 보유). 운영 다중 pod 은 슬롯별 경로 라우팅으로 per-pod 격리(Phase 3).
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const session = await getSession();
  if (!session) return new Response('unauthorized', { status: 401 });

  // 이 유저가 진행 중(running)이고 슬롯이 배정된 응시를 갖고 있나(=자기 컨테이너 접근 자격).
  const row = await queryOne<{ ok: number }>(
    `SELECT 1 AS ok
       FROM exam.attempts a
       JOIN hosted.slots s ON s.attempt_id = a.id
      WHERE a.examinee_id = $1 AND a.status = 'running' AND s.state = 'assigned'
      LIMIT 1`,
    [session.userId],
  );
  if (!row) return new Response('forbidden', { status: 403 });
  return new Response('ok', { status: 200 });
}
