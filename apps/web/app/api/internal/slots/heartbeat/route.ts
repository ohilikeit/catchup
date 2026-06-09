import { ok, fail } from '@/lib/http';
import { env } from '@/lib/env';
import { heartbeat } from '@/lib/db/repositories/slots';

// POST /api/internal/slots/heartbeat — 슬롯 생존 신호. last_heartbeat_at 갱신.
// 근거: docs/2 §3④·§6. Internal 전용: shared secret으로만 인가.
// route는 얇게: secret 검증 → body 검증 → heartbeat → 봉투.

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

  const { batchId, slotNo } = body as Record<string, unknown>;

  // ── 3. body 검증 ──
  if (typeof batchId !== 'string' || batchId.trim() === '') {
    return fail('invalid_body', 'batchId(string)가 필요합니다.');
  }
  if (!Number.isInteger(slotNo) || (slotNo as number) < 0) {
    return fail('invalid_body', 'slotNo(int >= 0)가 필요합니다.');
  }

  // ── 4. heartbeat ──
  const found = await heartbeat(batchId.trim(), slotNo as number);
  if (!found) {
    return fail('slot_not_found', '해당 슬롯을 찾을 수 없습니다.', 404);
  }

  return ok({ alive: true });
}
