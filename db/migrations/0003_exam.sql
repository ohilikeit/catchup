-- 0003_exam — 코어: 문제 + 불변 버전 + 회차 + 응시 + 제출
-- 근거: docs/1 §3(v4). 뼈대의 진짜 seam = "accepted된 정규화 submission(+불변 problem_version + 출처/trust)".
-- 제공 방식(hosted vs byod)·채점·리포트는 이 seam 바깥 → 이 schema는 그것들을 모른다.

-- 문제(룩업): 의미있는 TEXT PK. role_track으로 직무 구분.
CREATE TABLE exam.problems (
  code       TEXT PRIMARY KEY,                     -- 'planning'
  role_track TEXT NOT NULL CHECK (role_track IN ('planning','dev','marketing')),
  title      TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ⭐ 불변 스냅샷(재현·공정성). 공개 골격만 참조 — hidden 테스트/정답은 여기 두지 않음(reference/05).
CREATE TABLE exam.problem_versions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_code        TEXT NOT NULL REFERENCES exam.problems(code) ON DELETE RESTRICT,
  version             INT NOT NULL,
  public_scaffold_ref TEXT NOT NULL,               -- 오브젝트 스토리지 ref(공개 골격)
  scaffold_sha256     TEXT NOT NULL,
  published_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_problem_version UNIQUE (problem_code, version)
);

-- 회차(=동시 50명 한 창). delivery_mode는 셀렉터(하류는 모름).
CREATE TABLE exam.batches (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL REFERENCES auth.organizations(id) ON DELETE RESTRICT,
  name               TEXT NOT NULL,
  problem_version_id UUID NOT NULL REFERENCES exam.problem_versions(id) ON DELETE RESTRICT,  -- 불변 FK
  delivery_mode      TEXT NOT NULL DEFAULT 'hosted' CHECK (delivery_mode IN ('hosted','byod')),
  capacity           INT  NOT NULL DEFAULT 50,     -- 동시 응시 상한. 인원 많으면 회차 분할
  status             TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','open','closed')),
  scheduled_at       TIMESTAMPTZ,
  opened_at          TIMESTAMPTZ,
  closed_at          TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_batches_updated BEFORE UPDATE ON exam.batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 응시. ⭐ 채점상태 없음(grading 모듈 소관). delivery_mode 셀렉터는 회차에서 상속.
CREATE TABLE exam.attempts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id      UUID NOT NULL REFERENCES exam.batches(id) ON DELETE RESTRICT,
  examinee_id   TEXT NOT NULL,                     -- auth.users.id (cross-domain 약한참조, reference/02 §7)
  delivery_mode TEXT NOT NULL DEFAULT 'hosted' CHECK (delivery_mode IN ('hosted','byod')),
  status        TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready','running','submitted','expired','void')),
  starts_at     TIMESTAMPTZ,
  deadline_at   TIMESTAMPTZ,                       -- ⭐ 서버강제 마감(제출 API가 트랜잭션서 재판정)
  submitted_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_attempt UNIQUE (batch_id, examinee_id)  -- 한 회차에 한 응시
);
CREATE TRIGGER trg_attempts_updated BEFORE UPDATE ON exam.attempts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ⭐ exam.submissions = 뼈대의 최종 산출물 = 채점 모듈의 단일 입구. 'accepted'만 채점 대상.
-- attempt_id UNIQUE = 1:1(reference/02 §11).
CREATE TABLE exam.submissions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id          UUID NOT NULL UNIQUE REFERENCES exam.attempts(id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','validating','accepted','rejected')),
  tool                TEXT,
  chat_format_version INT  NOT NULL DEFAULT 1,
  captured_via        TEXT NOT NULL CHECK (captured_via IN ('proxy','upload')),
  trust               TEXT NOT NULL DEFAULT 'unverified'  -- ⭐ 서버가 어댑터 신원으로만 산출(클라 설정 불가)
    CHECK (trust IN ('verified','unverified')),
  validation_error    TEXT,
  accepted_at         TIMESTAMPTZ,
  submitted_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_submissions_updated BEFORE UPDATE ON exam.submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 대화로그/산출물 실물 메타(실물은 오브젝트 스토리지, DB엔 메타·sha256·ref만 — reference/02 §11).
CREATE TABLE exam.submission_files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES exam.submissions(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('chat_log','artifact')),
  ref           TEXT NOT NULL,
  sha256        TEXT NOT NULL,
  size_bytes    BIGINT NOT NULL,
  mime          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 감사/관측 (append-only). BIGSERIAL = 순번이면 충분(reference/02 §3).
CREATE TABLE exam.attempt_events (
  id         BIGSERIAL PRIMARY KEY,
  attempt_id UUID NOT NULL REFERENCES exam.attempts(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,                        -- started/heartbeat/crash/reconnect/uploaded/submitted ...
  detail     JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 인덱스(reference/02 §6): FK·필터·최신순
CREATE INDEX idx_pv_problem    ON exam.problem_versions(problem_code);          -- ① FK
CREATE INDEX idx_batch_org     ON exam.batches(org_id);                         -- ① FK
CREATE INDEX idx_batch_status  ON exam.batches(status);                         -- ② 필터
CREATE INDEX idx_att_batch     ON exam.attempts(batch_id);                      -- ① FK
CREATE INDEX idx_att_examinee  ON exam.attempts(examinee_id);                   -- ① FK(약한참조)
CREATE INDEX idx_att_status    ON exam.attempts(status);                        -- ② 필터
CREATE INDEX idx_sub_status    ON exam.submissions(status);                     -- ② 필터
CREATE INDEX idx_subfile_sub   ON exam.submission_files(submission_id);         -- ① FK
CREATE INDEX idx_evt_att       ON exam.attempt_events(attempt_id, created_at);  -- ④ 복합(최신순)
