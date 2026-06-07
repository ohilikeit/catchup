// 환경변수 단일 창구. 근거: reference/01 §4(mode별 .env로 환경 분리). 서버 전용.
//
// ⚠️ 지연 평가(getter): import 시점이 아니라 "실제 접근 시점"에만 검증한다.
// 빌드 타임(next build의 page data 수집)에는 .env가 없으므로, 최상위에서 던지면 빌드가 깨진다.
// 요청 시점에 비로소 값을 읽어 누락이면 그때 명확히 실패시킨다.

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`환경변수 ${name} 이(가) 설정되지 않았습니다. .env.example 을 참고하세요.`);
  return v;
}

export const env = {
  /** Postgres 연결 문자열(정보원). 필수. */
  get databaseUrl(): string {
    return required('DATABASE_URL');
  },
  /** Redis 연결 문자열(캐시/세션/카운터). 필수지만 Redis 자체는 fail-soft. */
  get redisUrl(): string {
    return required('REDIS_URL');
  },
  /** Postgres 풀 최대 커넥션(reference/09 DB 풀). */
  get dbPoolMax(): number {
    return Number(process.env.DB_POOL_MAX ?? 10);
  },
  get nodeEnv(): string {
    return process.env.NODE_ENV ?? 'development';
  },
  /**
   * 세션 쿠키 HMAC 서명 키. 위조 방지(reference/05).
   * production에서는 필수. dev에서만 불안정 기본값 허용(경고 목적의 고정 문자열).
   */
  get sessionSecret(): string {
    const v = process.env.SESSION_SECRET;
    if (v) return v;
    if ((process.env.NODE_ENV ?? 'development') === 'production') {
      throw new Error('환경변수 SESSION_SECRET 이(가) 설정되지 않았습니다. (세션 서명 키)');
    }
    return 'dev-insecure-session-secret-do-not-use-in-prod';
  },
} as const;
