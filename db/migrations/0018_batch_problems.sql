-- 0018_batch_problems — 회차 N문제(다대다). 한 회차에 문제 여러 개(학생 workspace에 1번문제/2번문제 폴더).
-- 설계: batches.problem_version_id 는 "대표 문제(seq=1)"로 그대로 두고(기존 조인·UI·attempts 무변경),
--       전체 문제 목록은 batch_problems 로 관리한다(provision/seed 가 seq 순서로 순회). 근거: docs/5, docs/2.
-- 불변식: batch_problems 에 반드시 seq=1 행이 존재하고 그 problem_version_id = batches.problem_version_id(대표).

CREATE TABLE exam.batch_problems (
  batch_id           UUID NOT NULL REFERENCES exam.batches(id) ON DELETE CASCADE,
  problem_version_id UUID NOT NULL REFERENCES exam.problem_versions(id) ON DELETE RESTRICT,  -- 불변 FK
  seq                INT  NOT NULL CHECK (seq >= 1),   -- 1,2,… 학생 workspace 폴더 순번(1번문제/2번문제)
  PRIMARY KEY (batch_id, seq),
  CONSTRAINT uq_batch_problem UNIQUE (batch_id, problem_version_id)  -- 같은 문제 중복 출제 금지
);

-- 백필: 기존 회차의 단일 문제를 seq=1(대표)로 이전. append-only — 기존 데이터 보존.
INSERT INTO exam.batch_problems (batch_id, problem_version_id, seq)
SELECT id, problem_version_id, 1 FROM exam.batches
ON CONFLICT DO NOTHING;
