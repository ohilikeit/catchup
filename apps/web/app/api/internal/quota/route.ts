import { ok, fail } from '@/lib/http';
import { env } from '@/lib/env';
import { consumePromptBySlot } from '@/lib/services/examOpsService';

// POST /api/internal/quota — LiteLLM 중계가 호출하는 쿼터 소비 엔드포인트. 근거: docs/batch-prompt-quota T4.
// 학생 pod는 NetworkPolicy로 egress가 litellm:4000만 허용 → 이 엔드포인트를 직접 칠 수 없음.
// LiteLLM 패스스루가 x-internal-secret을 부착해 중계(T5). 학생 pod에는 secret 미주입.
//
// ⚠️ 이 POST 호출이 1 프롬프트를 소비한다(type='prompt' INSERT).
// UserPromptSubmit 훅이 프롬프트 제출당 정확히 1회 호출 → 카운트 누락 없음.
// route는 얇게: secret 검증 → body 검증 → 쿼터 소비 → 봉투 반환.
// 훅 측은 호출 실패 시 fail-open(시험 중 멈춤 방지). 이 경로 자체는 정상 처리.

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // ── 1. shared secret 검증(LiteLLM 중계 등 서버측 호출만) ──
  const secret = req.headers.get('x-internal-secret') ?? '';
  const expected = env.internalApiSecret;
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
    return fail('invalid_body', 'slotNo는 0 이상의 정수여야 합니다.');
  }

  // ── 4. 쿼터 소비(type='prompt' INSERT) — 이 호출이 1 프롬프트를 소비한다 ──
  let status: { used: number; limit: number; remaining: number; blocked: boolean };
  try {
    status = await consumePromptBySlot(batchId.trim(), slotNo as number);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '쿼터 소비 중 오류가 발생했습니다.';
    return fail('quota_error', msg, 404);
  }

  return ok(status);
}
