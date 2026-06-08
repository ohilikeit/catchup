-- 0009_drop_byod — ⚠️ BYOD(Bring Your Own Device) 어댑터 폐기. 코드·문서·스키마 전면 제거의 DB 부분.
-- 결정: delivery_mode 개념 자체 제거(이제 hosted 단일). trust·captured_via 컬럼은 hosted가 쓰는 공용이라
--       유지하되 byod 값('upload'/'unverified')만 CHECK에서 제거. (철칙 1: 적용 파일 불변 → 새 마이그레이션)
-- 보존(건드리지 않음): hosted schema(0004)·운영모델(0007)·슬롯상태(0008)·MinIO·lib/storage.

-- 1) byod 제출 데이터 purge — CHECK 강화 전에 선행(기존 'upload'/'unverified' 행이 새 CHECK 위반 방지).
--    submission_files는 ON DELETE CASCADE로 함께 삭제됨.
DELETE FROM exam.submissions WHERE captured_via = 'upload' OR trust = 'unverified';

-- 2) delivery_mode 제거 — hosted/byod 셀렉터가 무의미(hosted 단일). 컬럼째 삭제(값·CHECK 동반 제거).
ALTER TABLE exam.batches  DROP COLUMN delivery_mode;
ALTER TABLE exam.attempts DROP COLUMN delivery_mode;

-- 3) captured_via/trust 컬럼은 유지, byod 값만 제거. 기본값도 hosted 기준으로 정정.
ALTER TABLE exam.submissions ALTER COLUMN trust SET DEFAULT 'verified';
ALTER TABLE exam.submissions DROP CONSTRAINT submissions_captured_via_check;
ALTER TABLE exam.submissions ADD  CONSTRAINT submissions_captured_via_check CHECK (captured_via IN ('proxy'));
ALTER TABLE exam.submissions DROP CONSTRAINT submissions_trust_check;
ALTER TABLE exam.submissions ADD  CONSTRAINT submissions_trust_check CHECK (trust IN ('verified'));
