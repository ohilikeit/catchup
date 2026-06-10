import { ok, fail } from '@/lib/http';
import { getSession } from '@/lib/auth/session';
import { getRuntimeWithSlot } from '@/lib/services/examService';
import { reconcilePool, poolSnapshot } from '@/lib/services/examOpsService';
import { entryQueueRepo, slotsRepo } from '@/lib/db';

// GET /api/exam/[attemptId]/slot-status — 대기 화면의 2초 폴링 + 워밍 풀 reconcile 트리거.
// docs/6 Phase 3 워밍 풀: 실시간 채널은 폴링 채택(WS는 이 인프라에서 실측 502 — 1c 채택 경위).
// ⭐ 요청 유도형 컨트롤러: 폴링이 곧 reconcile tick — 별도 데몬 없이 pod Ready 동기화·큐 배정·scale 보충.

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { attemptId: string } }) {
  const session = await getSession();
  if (!session) return fail('unauthorized', '로그인이 필요합니다.', 401);

  // 소유권·상태 검증(service가 재판정 — IDOR 방지).
  const result = await getRuntimeWithSlot(params.attemptId, session.userId);
  if (!result) return fail('not_found', '응시를 찾을 수 없습니다.', 404);
  const { runtime, slot } = result;
  if (runtime.status !== 'running') {
    return ok({ assigned: false as const, status: runtime.status });
  }

  // 이미 배정 — 즉시 입장.
  if (slot && slot.state === 'assigned') {
    return ok({ assigned: true as const, slotNo: slot.slotNo });
  }

  // 미배정 — reconcile(멱등·락 경합 시 통과) 후 재확인.
  await reconcilePool(runtime.batchId);
  const after = await slotsRepo.findActiveSlotByAttempt(params.attemptId);
  if (after && after.state === 'assigned') {
    return ok({ assigned: true as const, slotNo: after.slotNo });
  }

  // 대기 정보: 줄 순번 + 풀 기동 현황(단계 표시용).
  const position = await entryQueueRepo.positionOf(params.attemptId);
  const pool = await poolSnapshot(runtime.batchId);
  return ok({
    assigned: false as const,
    status: 'running',
    position,
    podsReady: pool?.podsReady ?? 0,
    podsStarting: pool?.podsStarting ?? 0,
  });
}
