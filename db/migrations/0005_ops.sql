-- 0005_ops — 운영: 로스터 CSV import 추적(재실행 가능)
-- 근거: docs/1 §4(운영 데이터, 9월 P0). admin/batches에서 CSV import → users + org_members + attempts 멱등 생성.
-- import 자체를 추적해 부분 실패·재실행을 안전하게(멱등) 만든다.

CREATE TABLE ops.roster_imports (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id   UUID NOT NULL REFERENCES exam.batches(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed')),
  summary    JSONB NOT NULL DEFAULT '{}',          -- {created, skipped, errors} 집계
  created_by TEXT,                                  -- auth.users.id(약한참조)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_roster_imports_updated BEFORE UPDATE ON ops.roster_imports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 행 단위 결과(원본 raw + 처리 결과). 무엇이 왜 실패했는지 행별 추적.
CREATE TABLE ops.roster_import_rows (
  id        BIGSERIAL PRIMARY KEY,
  import_id UUID NOT NULL REFERENCES ops.roster_imports(id) ON DELETE CASCADE,
  raw       JSONB NOT NULL,                         -- CSV 원본 한 행
  result    TEXT NOT NULL DEFAULT 'pending'
    CHECK (result IN ('pending','created','skipped','error')),
  error     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_roster_imp_batch ON ops.roster_imports(batch_id);          -- ① FK
CREATE INDEX idx_roster_row_imp   ON ops.roster_import_rows(import_id);     -- ① FK
