// 환경변수 단일 창구. 근거: reference/01 §4(mode별 .env로 환경 분리). 서버 전용.
//
// ⚠️ 지연 평가(getter): import 시점이 아니라 "실제 접근 시점"에만 검증한다.
// 빌드 타임(next build의 page data 수집)에는 .env가 없으므로, 최상위에서 던지면 빌드가 깨진다.
// 요청 시점에 비로소 값을 읽어 누락이면 그때 명확히 실패시킨다.

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`환경변수 ${name} 이(가) 설정되지 않았습니다. .env.secret.example 을 참고하세요.`);
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

  /* ── MinIO(객체 스토리지) — 제출 산출물·대화로그 실체 저장. docs/5 §1·§2. ──
   * 로컬 기본값은 docker-compose minio 서비스와 일치(그대로 동작). prod는 전부 override. */
  get minioEndpoint(): string {
    return process.env.MINIO_ENDPOINT ?? 'localhost';
  },
  get minioPort(): number {
    return Number(process.env.MINIO_PORT ?? 9000);
  },
  get minioUseSSL(): boolean {
    return process.env.MINIO_USE_SSL === 'true';
  },
  get minioAccessKey(): string {
    return process.env.MINIO_ACCESS_KEY ?? 'catchup';
  },
  get minioSecretKey(): string {
    return process.env.MINIO_SECRET_KEY ?? 'catchup-minio';
  },

  /* ── LiteLLM 게이트웨이 — 가상키 발급(/key/generate)·spend 조회(/key/info). docs/3 §2.
   * 게이트웨이는 옵트인(docker compose --profile gateway). 미기동 시 관련 기능만 비활성.
   * 진짜 Anthropic 키는 게이트웨이에만 — 앱은 master key로 가상키를 발급/조회만 한다(대원칙 5⑤). ── */
  get litellmBaseUrl(): string {
    return process.env.LITELLM_BASE_URL ?? 'http://localhost:4000';
  },
  get litellmMasterKey(): string {
    return required('LITELLM_MASTER_KEY');
  },
} as const;
