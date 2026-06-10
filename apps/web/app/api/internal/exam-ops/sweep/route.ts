import { ok, fail } from '@/lib/http';
import { env } from '@/lib/env';
import { sweepDeadlines } from '@/lib/services/examService';

// POST /api/internal/exam-ops/sweep — 마감 지난 미제출 응시 전수 자동 회수(패키징). docs/5 §5·docs/6 Phase 3.
// close 가 이미 close 직전에 sweep 하지만, 회차 진행 중 중간 회수(개별 마감 누적)를 운영자가 수동 트리거할 때 사용.
// 호출자: exam-ops.sh sweep <batchId>. Internal 전용: shared secret 인가.

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const secret = req.headers.get('x-internal-secret') ?? '';
  const expected = env.internalApiSecret;
  if (!expected || secret !== expected) {
    return fail('unauthorized', 'x-internal-secret 헤더가 올바르지 않습니다.', 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', '요청 본문을 JSON으로 파싱할 수 없습니다.');
  }
  const { batchId } = (body ?? {}) as Record<string, unknown>;
  if (typeof batchId !== 'string' || batchId.trim() === '') {
    return fail('invalid_body', 'batchId(string, uuid)가 필요합니다.');
  }

  try {
    const collected = await sweepDeadlines(batchId.trim());
    return ok({ collected });
  } catch (e: unknown) {
    return fail('sweep_failed', e instanceof Error ? e.message : String(e), 500);
  }
}
