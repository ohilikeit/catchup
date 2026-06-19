import { ok, fail } from '@/lib/http';
import { env } from '@/lib/env';
import { findSnapshotConfig } from '@/lib/db/repositories/attempts';

// GET /api/internal/attempts/snapshot-config?attemptId=… — 워커가 유효 스냅샷 설정을 조회.
// 근거: docs/10 §7·§8. 기본 제외 + 문제별 제외(불변, problem_version) 병합 결과를 반환.
// 워커는 이 excludePatterns로 tar --exclude, debounceSec로 최소 간격을 적용한다.

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // ── 1. shared secret 검증 ──
  const secret = req.headers.get('x-internal-secret') ?? '';
  const expected = env.internalApiSecret;
  if (!expected || secret !== expected) {
    return fail('unauthorized', 'x-internal-secret 헤더가 올바르지 않습니다.', 401);
  }

  // ── 2. query 검증 ──
  const attemptId = new URL(req.url).searchParams.get('attemptId')?.trim() ?? '';
  if (attemptId === '') {
    return fail('invalid_query', 'attemptId 쿼리 파라미터가 필요합니다.');
  }

  // ── 3. 유효 설정 조회 ──
  const config = await findSnapshotConfig(attemptId);
  if (!config) {
    return fail('attempt_not_found', '해당 응시를 찾을 수 없습니다.', 404);
  }

  return ok(config);
}
