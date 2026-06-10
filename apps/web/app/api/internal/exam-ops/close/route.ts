import { ok, fail } from '@/lib/http';
import { env } from '@/lib/env';
import { closeBatch } from '@/lib/services/examOpsService';

// POST /api/internal/exam-ops/close — 회차 환경 close(N→0 + 가상키 revoke + 슬롯 down). docs/6 Phase 3.
// Internal 전용: shared secret으로만 인가.

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
    const result = await closeBatch(batchId.trim());
    return ok(result);
  } catch (e: unknown) {
    return fail('close_failed', e instanceof Error ? e.message : String(e), 500);
  }
}
