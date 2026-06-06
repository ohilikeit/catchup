-- 0002_auth — 정체성 + 조직 + 역할
-- 근거: docs/1 §2·§3, reference/02 §7(약한참조 경계), §8(정체성 vs 도메인역할 분리), §9(M:N 조인), §11(soft delete).
-- 정체성(users)과 도메인 역할(org_members.org_role / user_roles)을 분리한다(reference/02 §8).

-- 로그인 계정. 노출 핵심 엔티티지만, 타 도메인에서 약한참조(TEXT)로 가리키므로 id를 TEXT로 둔다.
-- (cross-domain FK를 걸지 않는 reference/02 §7 결정과 타입을 맞춤 — examinee_id/user_id 비교 시 캐스팅 불필요)
CREATE TABLE auth.users (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email         TEXT UNIQUE,                       -- 로그인 식별(매직링크/임시비번)
  full_name     TEXT NOT NULL DEFAULT '',
  password_hash TEXT,                              -- bcrypt(reference/05). 매직링크만 쓰면 NULL 가능
  external_id   TEXT,                              -- 학번 등 외부 식별자(org 내 UNIQUE는 org_members 쪽에서)
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,     -- soft delete(시험 기록 보존)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 전역 역할(M:N). 사내 인원만 — admin/author/grader. examinee·org_admin은 org 단위라 org_members로.
CREATE TABLE auth.user_roles (
  user_id    TEXT NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('admin','author','grader')),
  granted_by TEXT,                                 -- auth.users.id(약한참조)
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role)                      -- 복합 PK = 중복 부여 자동 차단
);

CREATE TABLE auth.organizations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  code       TEXT UNIQUE,                          -- 업무코드(대리키 id와 분리, reference/02 §8)
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,        -- soft delete(시험 기록 보존)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_orgs_updated BEFORE UPDATE ON auth.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 사용자 ↔ 조직 + 조직 내 역할. org 스코프 권한의 원천.
CREATE TABLE auth.org_members (
  org_id      UUID NOT NULL REFERENCES auth.organizations(id) ON DELETE RESTRICT,
  user_id     TEXT NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- 동일 도메인 → 실제 FK
  org_role    TEXT NOT NULL DEFAULT 'examinee' CHECK (org_role IN ('examinee','org_admin')),
  external_id TEXT,                                -- 이 org 내 학번 등
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (org_id, user_id),
  CONSTRAINT uq_orgmem_external UNIQUE (org_id, external_id)  -- org 내 학번 유일(NULL은 중복 허용)
);

-- 온보딩: 초대/임시자격 토큰. 만료는 expires_at, 1회용은 used_at으로.
CREATE TABLE auth.invitations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token      TEXT NOT NULL UNIQUE,                 -- 해시 저장 권장(reference/05)
  user_id    TEXT REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id     UUID REFERENCES auth.organizations(id) ON DELETE CASCADE,
  purpose    TEXT NOT NULL DEFAULT 'invite' CHECK (purpose IN ('invite','password_reset')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 인덱스(reference/02 §6): FK·필터
CREATE INDEX idx_orgmem_user  ON auth.org_members(user_id);                 -- ① FK
CREATE INDEX idx_inv_user     ON auth.invitations(user_id);                 -- ① FK
CREATE INDEX idx_inv_active   ON auth.invitations(expires_at) WHERE used_at IS NULL;  -- ⑤ 부분(미사용 토큰만)
