import 'server-only';

// 과정 스냅샷 기본 제외 목록. 근거: docs/10-interaction-tracking-system.md §8.
// 환경/빌드 산출물은 항상 제외(추적 의미 0 + 용량). 문제별 추가 제외는
// exam.problem_versions.snapshot_config.excludePatterns 로 더해진다(불변, 시험별 규칙).
// 워커는 [기본 + 문제별]을 tar --exclude 로 적용하고, scaffold와 sha256이 같은 파일은 자동 스킵한다.
export const DEFAULT_EXCLUDE_PATTERNS: readonly string[] = [
  'node_modules/**',
  '.venv/**',
  '__pycache__/**',
  '.git/**',
  '.next/**',
  'dist/**',
  'build/**',
  '*.lock',
  '.claude/**', // 대화 transcript는 별도 chatlog 파이프라인이 회수 — 스냅샷에 중복 포함하지 않음
];
