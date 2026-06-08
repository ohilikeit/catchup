import { pingDb } from '@/lib/db';
import { pingRedis } from '@/lib/cache';
import { pingStorage } from '@/lib/storage';
import { ok, fail } from '@/lib/http';

// 부팅/운영 헬스체크: DB(필수)·Redis(보조)·MinIO(제출 저장)의 실제 가용성(reference/01 §5).
// DB가 죽으면 503(필수 의존성). Redis/MinIO만 죽으면 200이되 degraded(제출만 영향, fail-soft 표기).
export const dynamic = 'force-dynamic'; // 매 요청 실제 상태를 본다(정적 캐시 금지)

export async function GET() {
  const [db, redis, storage] = await Promise.all([pingDb(), pingRedis(), pingStorage()]);

  if (!db) {
    return fail('DB_UNAVAILABLE', 'PostgreSQL 에 연결할 수 없습니다.', 503);
  }

  return ok({
    db: 'up' as const,
    redis: redis ? ('up' as const) : ('down' as const), // Redis는 down이어도 서비스는 degraded로 동작
    storage: storage ? ('up' as const) : ('down' as const), // MinIO down이면 제출 저장 불가(나머지 동작)
    status: redis && storage ? ('healthy' as const) : ('degraded' as const),
  });
}
