import 'server-only';

// MinIO 버킷 이름(정보원). docs/5 §2 — 입력/출력 분리, 전부 private(서버 자격으로만 접근).
//   scaffold  : 입력(공개 골격) — 학생 환경에 시드(읽기)
//   hidden    : ⚠️ 서버 전용(hidden-tests) — 학생 자격 접근 0
//   artifacts : 출력(제출 코드/산출물 zip)
//   chatlogs  : 출력(대화 정규화 JSON)
//   snapshots : 과정 추적(시험 중 PVC 스냅샷 시계열) — 서버 워커만 쓰기, 학생 접근 0. docs/10.
export const BUCKETS = {
  scaffold: 'exam-scaffold',
  hidden: 'exam-hidden',
  artifacts: 'exam-artifacts',
  chatlogs: 'exam-chatlogs',
  snapshots: 'exam-snapshots',
} as const;

export type BucketName = (typeof BUCKETS)[keyof typeof BUCKETS];
