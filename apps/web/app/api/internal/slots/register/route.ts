import { ok, fail } from '@/lib/http';
import { env } from '@/lib/env';
import { withTransaction } from '@/lib/db/pool';
import { registerSlotTx } from '@/lib/db/repositories/slots';

// POST /api/internal/slots/register — pod 부팅 시 슬롯 등록.
// 근거: docs/2 §3④·§6. Internal 전용: shared secret으로만 인가.
// route는 얇게: secret 검증 → body 검증 → registerSlotTx → 봉투.

export async function POST(req: Request) {
  // ── 1. shared secret 검증 ──
  const secret = req.headers.get('x-internal-secret') ?? '';
  const expected = env.internalApiSecret;
  // secret이 빈 문자열이면(미설정) 모든 요청 거부(보안 기본값).
  if (!expected || secret !== expected) {
    return fail('unauthorized', 'x-internal-secret 헤더가 올바르지 않습니다.', 401);
  }

  // ── 2. body 파싱 ──
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', '요청 본문을 JSON으로 파싱할 수 없습니다.');
  }

  if (typeof body !== 'object' || body === null) {
    return fail('invalid_body', '요청 본문이 객체여야 합니다.');
  }

  const { batchId, slotNo, endpoint } = body as Record<string, unknown>;

  // ── 3. body 검증 ──
  if (typeof batchId !== 'string' || batchId.trim() === '') {
    return fail('invalid_body', 'batchId(string, uuid)가 필요합니다.');
  }
  if (!Number.isInteger(slotNo) || (slotNo as number) < 0) {
    return fail('invalid_body', 'slotNo(int >= 0)가 필요합니다.');
  }
  if (typeof endpoint !== 'string' || endpoint.trim() === '') {
    return fail('invalid_body', 'endpoint(string)가 필요합니다.');
  }

  // ── 4. upsert ──
  try {
    await withTransaction(async (client) => {
      await registerSlotTx(client, {
        batchId: batchId.trim(),
        slotNo: slotNo as number,
        endpoint: endpoint.trim(),
      });
    });
  } catch (err: unknown) {
    // pg error code 23503 (foreign_key_violation): exam.batches(id) FK 위반
    const pgErr = err as { code?: string };
    if (pgErr?.code === '23503') {
      return fail('invalid_batch', '존재하지 않는 batchId 입니다.');
    }
    throw err;
  }

  return ok({ registered: true });
}
