import 'server-only';
import Redis from 'ioredis';
import { env } from '../env';

// 단일 ioredis 연결(프로세스당 1개). fail-soft: Redis가 죽어도 서버는 부팅/동작(경고만).
// 근거: reference/03 §1(연결: fail-soft), §8(Redis는 보조장치 — 통째로 날려도 데이터 손실 0).
//
// ⚠️ 지연 생성: 모듈 import 시점에 연결을 만들지 않는다(빌드 타임엔 env가 없음).
// 첫 사용에서 getRedis()가 생성·메모이즈. Next dev HMR 누적 방지를 위해 globalThis 캐시.
declare global {
  // eslint-disable-next-line no-var
  var __catchupRedis: Redis | undefined;
}

export function getRedis(): Redis {
  if (!globalThis.__catchupRedis) {
    const client = new Redis(env.redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 50, 2000), // 점증 백오프(최대 2초)
      lazyConnect: true, // 첫 명령에 연결 — 부팅이 Redis 가용성에 묶이지 않음
    });
    // 연결 에러로 프로세스가 죽지 않도록 흡수(캐시는 필수 의존성 아님).
    client.on('error', (err) => {
      console.warn('[redis] connection error (fail-soft):', err.message);
    });
    globalThis.__catchupRedis = client;
  }
  return globalThis.__catchupRedis;
}

/** 헬스 체크용 ping. Redis가 없어도 false만 반환하고 던지지 않음. */
export async function pingRedis(): Promise<boolean> {
  try {
    const pong = await getRedis().ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}
