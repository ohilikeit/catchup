import { pingDb } from '@/lib/db';
import { pingRedis } from '@/lib/cache';
import { ok, fail } from '@/lib/http';

// 부팅/운영 헬스체크: DB(필수)와 Redis(보조)의 실제 가용성 확인(reference/01 §5).
// DB가 죽으면 503(필수 의존성), Redis만 죽으면 200이되 degraded(fail-soft).
export const dynamic = 'force-dynamic'; // 매 요청 실제 상태를 본다(정적 캐시 금지)

export async function GET() {
  const [db, redis] = await Promise.all([pingDb(), pingRedis()]);

  if (!db) {
    return fail('DB_UNAVAILABLE', 'PostgreSQL 에 연결할 수 없습니다.', 503);
  }

  return ok({
    db: 'up' as const,
    redis: redis ? ('up' as const) : ('down' as const), // Redis는 down이어도 서비스는 degraded로 동작
    status: redis ? ('healthy' as const) : ('degraded' as const),
  });
}
