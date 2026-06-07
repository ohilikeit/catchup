import 'server-only';

// 이름 붙은 TTL 정책(초). 매직넘버 금지 — 길이 = "얼마나 오래된 데이터를 견딜 수 있나(stale tolerance)".
// 근거: reference/03 §2·§7. 보안민감 = 짧게, 안정설정 = 길게.
export const TTL = {
  TOKEN: 10, // 보안민감 → revoke 지연 최소화
  PERMISSION: 60, // 1분
  SESSION: 60 * 60 * 12, // 12시간
  BATCH_STATUS: 30, // 회차 현황(실시간성 중요)
  TEST_CONFIG: 60 * 60, // 1시간
  CONTENT: 60 * 60 * 6, // 6시간
  CONFIG: 60 * 60 * 24, // 안정적 → 24시간
  // ⭐ AI 평가 결과: 같은 루브릭+같은 답안은 재평가 불필요(reference/03 §7). grading 모듈에서 사용.
  AI_GRADE: 60 * 60 * 24 * 30, // 30일
} as const;

export type TtlKey = keyof typeof TTL;
