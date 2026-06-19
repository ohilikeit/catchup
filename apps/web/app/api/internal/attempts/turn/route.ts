import { ok, fail } from '@/lib/http';
import { env } from '@/lib/env';
import { recordTurnEvent } from '@/lib/db/repositories/attempts';
import { findAttemptBySlotNo } from '@/lib/db/repositories/slots';
import { snapshotAttempt } from '@/lib/services/examOpsService';

// POST /api/internal/attempts/turn — LiteLLM 프록시의 "AI 응답 완료" 콜백. 근거: docs/10 §4.
// 프록시가 응답 성공 시(async custom callback) 호출. attemptId는 가상키 metadata에서 옴.
// route는 얇게: secret 검증 → body 검증 → 턴 이벤트 기록(running일 때만) → 봉투.
// 스냅샷 실제 캡처는 워커 소관 — 여기선 트리거 근거(turn 이벤트)만 append.

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // ── 1. shared secret 검증(프록시/워커 등 서버측 호출만) ──
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

  const { attemptId, batchId, slotNo, turnIndex, model } = body as Record<string, unknown>;

  // ── 3. body 검증 ──
  if (turnIndex != null && (!Number.isInteger(turnIndex) || (turnIndex as number) < 0)) {
    return fail('invalid_body', 'turnIndex는 0 이상의 정수여야 합니다.');
  }
  if (model != null && typeof model !== 'string') {
    return fail('invalid_body', 'model은 문자열이어야 합니다.');
  }

  // ── 3b. 응시 식별: attemptId 직접 지정, 또는 (batchId, slotNo)로 해소(워처 경로). ──
  let resolvedAttemptId: string;
  if (typeof attemptId === 'string' && attemptId.trim() !== '') {
    resolvedAttemptId = attemptId.trim();
  } else if (typeof batchId === 'string' && batchId.trim() !== '' && Number.isInteger(slotNo) && (slotNo as number) >= 0) {
    const found = await findAttemptBySlotNo(batchId.trim(), slotNo as number);
    if (!found) {
      // 슬롯 미배정(워밍 중 등) — 진행 중 응시 아님. 조용히 무시(404).
      return fail('attempt_not_running', '해당 슬롯에 배정된 응시가 없습니다.', 404);
    }
    resolvedAttemptId = found;
  } else {
    return fail('invalid_body', 'attemptId(string) 또는 (batchId, slotNo)가 필요합니다.');
  }

  // ── 4. 턴 이벤트 기록(running 상태 attempt만) ──
  const recorded = await recordTurnEvent(resolvedAttemptId, {
    ...(turnIndex != null ? { turnIndex: turnIndex as number } : {}),
    ...(model != null ? { model: model as string } : {}),
  });
  if (!recorded) {
    // attempt 없음 또는 running 아님 — 진행 중이 아닌 응시의 콜백은 조용히 무시(404).
    return fail('attempt_not_running', '진행 중인 응시를 찾을 수 없습니다.', 404);
  }

  // ── 5. 턴 직후 스냅샷 spawn(debounce 적용). fail-soft: 실패해도 턴 기록·응답엔 영향 없음. ──
  let snapshot: { ok: boolean; reason?: string; jobName?: string };
  try {
    const r = await snapshotAttempt(resolvedAttemptId, {
      trigger: 'turn',
      ...(turnIndex != null ? { turnIndex: turnIndex as number } : {}),
    });
    snapshot = r.ok ? { ok: true, jobName: r.jobName } : { ok: false, reason: r.reason };
  } catch (e) {
    snapshot = { ok: false, reason: e instanceof Error ? e.message : 'snapshot error' };
  }

  return ok({ recorded: true, snapshot });
}
