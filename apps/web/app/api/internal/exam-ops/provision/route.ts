import { ok, fail } from '@/lib/http';
import { env } from '@/lib/env';
import { provisionBatch } from '@/lib/services/examOpsService';

// POST /api/internal/exam-ops/provision — 회차 환경 provision(0→N). docs/6 Phase 3.
// 호출자: exam-ops.sh(CLI 검증) / admin 서버액션은 service 를 직접 호출(HTTP 불필요).
// Internal 전용: shared secret으로만 인가(register route와 동일 패턴).

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
  const { batchId, n } = (body ?? {}) as Record<string, unknown>;
  if (typeof batchId !== 'string' || batchId.trim() === '') {
    return fail('invalid_body', 'batchId(string, uuid)가 필요합니다.');
  }
  if (n !== undefined && (!Number.isInteger(n) || (n as number) < 1)) {
    return fail('invalid_body', 'n은 1 이상의 정수여야 합니다.');
  }

  try {
    const result = await provisionBatch(batchId.trim(), { warm: n as number | undefined });
    return ok(result);
  } catch (e: unknown) {
    return fail('provision_failed', e instanceof Error ? e.message : String(e), 500);
  }
}
