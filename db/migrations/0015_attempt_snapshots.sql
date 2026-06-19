-- 0015_attempt_snapshots — 과정 추적(상호작용 스냅샷)의 DB 부분. 근거: docs/10-interaction-tracking-system.md.
-- 설계: 신규 테이블 0개 — append-only exam.attempt_events(type='turn'|'snapshot')를 그대로 쓴다.
--       스냅샷 실체는 MinIO(exam-snapshots), DB엔 포인터+메타(detail JSONB). 학생이 아니라 서버 워커가
--       readOnly로 PVC를 떠서 sha256을 산출 → trust='verified'(대원칙 ⑤). attempt_events.type엔 CHECK가
--       없어 'turn'·'snapshot'을 바로 쓴다.
-- 철칙 1: 적용 파일 불변 → 변경은 새 파일로. 러너(db/migrate.mjs)가 파일을 BEGIN/COMMIT으로 감싼다.

-- 1) 문제 버전에 스냅샷 설정(불변). problem_versions는 불변 스냅샷이라 "그 시험 당시 추적 규칙"이 영구 고정된다.
--    excludePatterns = 문제별 추적 제외(기본 제외 목록에 더해짐), debounceSec = 스냅샷 최소 간격(워커가 적용).
ALTER TABLE exam.problem_versions
  ADD COLUMN snapshot_config JSONB NOT NULL DEFAULT
    '{"enabled": true, "excludePatterns": [], "debounceSec": 30}'::jsonb;

COMMENT ON COLUMN exam.problem_versions.snapshot_config IS
  '과정 스냅샷 설정(불변): enabled | excludePatterns(문제별 추가 제외) | debounceSec(최소 간격). docs/10.';

-- 2) type='snapshot' 이벤트 조회용 부분 인덱스 — 과정 평가가 attempt별 스냅샷 시계열을 최신순으로 빠르게 읽는다.
CREATE INDEX idx_attempt_events_snapshot
  ON exam.attempt_events (attempt_id, created_at)
  WHERE type = 'snapshot';
