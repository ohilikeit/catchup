import 'server-only';

// 단일 MinIO 버킷(STORAGE_BUCKET). 운영 제약상 버킷은 1개만 쓴다 — 예전의 용도별 버킷들은
// 이 버킷 안의 최상위 "폴더"(키 접두)로 분리한다. 그래서 BUCKETS 값 = 버킷 접두(디렉터리).
// ref 는 여전히 `<접두>/<키>` 형태라 DB 포인터·호출부는 그대로다(실 객체 키와 1:1 일치).
//   scaffold  : 입력(공개 골격) — 학생 환경에 시드(읽기)
//   artifacts : 출력(제출 코드/산출물 zip)
//   chatlogs  : 출력(대화 정규화 JSON)
//   snapshots : 과정 추적(시험 중 PVC 스냅샷 시계열) — 서버 워커만 쓰기. docs/10.
// ⚠️ 학생 pod/클라는 MinIO 자격증명이 없어 직접 쓰지 못한다 — 서버(앱/Job)만 쓰기(docs/5 §2).
export const STORAGE_BUCKET = 'catchup-bucket';

export const BUCKETS = {
  scaffold: 'exam-scaffold',
  artifacts: 'exam-artifacts',
  chatlogs: 'exam-chatlogs',
  snapshots: 'exam-snapshots',
} as const;

// 버킷 접두(위 BUCKETS 값). storageService 가 `<접두>/<키>`로 실 객체 키를 만든다.
export type BucketName = (typeof BUCKETS)[keyof typeof BUCKETS];
