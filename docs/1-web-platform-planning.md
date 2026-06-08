# 1. 웹 플랫폼 기획 & 개발 Planning

> 목적: AI 업무역량 평가 플랫폼의 **웹 제품 뼈대**(마케팅·응시·결과조회·관리)를 기획·개발 순서로 정리한다.
> reference/01·02·04·06 결정을 기초로 하며, 충돌 시 그쪽이 우선. 형식: 핵심 한 줄 + 체크리스트 + 표.
> 개정 이력: v2 — Delivery/코어 분리 1급 원칙화. v3 — 역할 단순화·평가 모듈 분리·스크립트 외부화.
> **v4 — codex 리뷰 반영: attempt에서 평가상태 제거, org 역할 스코프, accepted submission + 무결성, 불변 problem version,
> soft-delete, hosted 슬롯 분리, 서버강제 deadline, trust 서버산출, 로스터/온보딩, 인덱스.**

## 핵심 한 줄
**3개 셸(마케팅 / 시험 런타임 / 대시보드) · 3개 청중(학생 / 학교담당자(고객) / 관리자(사내)), 단일 Next.js 앱.
뼈대의 진짜 seam = "accepted된 정규화 Submission(+불변 problem version + 출처/신뢰 메타)". 제공 방식(hosted)과
평가·리포트는 이 seam 바깥의 교체·후속 모듈이라, 바뀌어도 스키마·역할·대시보드·웹 기획은 그대로.**

---

## 0. 제품 한눈에

대학 교직원과 계약해 **취업 준비생에게 AI 업무활용역량을 평가**하는 상품. 2~3시간 바이브코딩 강의 후,
직무별(출발: **기획**) 과제를 AI 협업으로 풀고, **과정(AI 채팅) + 결과(산출물)**를 함께 평가해 리포트로 제공.

- **차별점(정체성):** 객관식 챗봇 테스트가 아니라 **상용 코딩 에이전트(Claude Code·Codex 등)를 시험에서 그대로 허용** —
  높은 자유도가 진짜 실력을 드러낸다. 비개발 직무도 에이전트로 자기 업무를 자동화 → 취업·생산성에 활용.
- **평가 2기둥(예시 리포트):** `AI 채팅 평가 50` + `결과(산출물) 평가 50`. 결과의 객관성이 가격·신뢰의 척추.
- **이미 2개 대학 계약, 9월 오픈.** 동시 응시 **최대 50명/회차(벌크)**.
- ⭐ **지금 범위 = 뼈대.** 평가·평가 리포트는 **별도 모듈**(자체 `grading` schema·기능·페이지). 코어는 `accepted된
  submission`이라는 **입구**까지만. 그 위(평가·점수·리포트)는 나중에 붙인다.
- ⭐ **제공 방식은 코어 바깥:** 코어는 submission만 소비한다. submission 하류(평가·리포트·대시보드)는 제공 방식을 모른다.
  전달방식은 hosted 단일이며, 어댑터 계약(attempt → accepted submission)만 지키면 하류는 무변경. (→ §5)
- **상태:** 디자인 시스템·docs 토대 완성, 앱은 쇼케이스 단계(그린필드).

---

## 1. 사이트맵 — 3 셸 / 3 청중 (→ [06](./reference/06-page-routing.md))

셸이 다른 영역을 route group으로 분리한다. **뼈대 화면은 "진행·제출 현황" 중심이고, 점수·리포트 화면은 평가 모듈 소관.**

```
app/
├── (marketing)/                 # 공개. 인증X. 가벼운 공개 헤더(셸 없음)
│   ├── page.tsx                 # 랜딩 = 영업 상품소개
│   ├── how-it-works/page.tsx    # 시험 진행 방식
│   ├── curriculum/page.tsx      # 바이브코딩 강의 소개
│   └── sample-report/page.tsx   # 샘플 리포트(예시 익명화) — 정적
│
├── login/page.tsx               # 통합 로그인 → 역할별 홈(ROLE_HOME)
├── change-password/page.tsx     # 첫 로그인 비밀번호 변경(임시비번 발급 후 강제)
│
├── (exam)/                      # 학생 시험 런타임. 풀스크린. 셸 없음
│   └── exam/[attemptId]/
│       ├── intro/page.tsx       # 시작 전 안내·규칙·환경 점검
│       ├── page.tsx             # ⭐ 시험 진행 — hosted 런타임(§4·§5)
│       └── done/page.tsx        # 제출 완료
│
├── showcase/                    # ⚠️ dev 전용 — 디자인 시스템 컴포넌트 쇼케이스(프로덕션 미노출)
├── console/                     # ⚠️ dev 전용 — 관리 프로토타입(프로덕션 미노출)
│
└── (app)/                       # 로그인 후. 영속 대시보드 셸 + 역할필터 메뉴
    ├── my/                      # ── examinee(학생)
    │   ├── exams/page.tsx       #   내 시험(예정/진행/완료)
    │   ├── lecture/page.tsx     #   공통 인터넷강의(바이브코딩 동영상 — 현재 목데이터, DB 진도 미구현)
    │   └── reports/[id]/page.tsx#   [평가 모듈 소관] 뼈대엔 placeholder(실 DB 메타 구조만)
    ├── org/                     # ── org_admin(고객, 자기 대학만)
    │   ├── dashboard/page.tsx   #   우리 대학 응시·제출 현황(점수집계는 평가 모듈 이후)
    │   ├── students/page.tsx    #   우리 대학 학생·제출 현황(DataTable)
    │   ├── students/[id]/page.tsx#   학생 상세 — 기본정보 + 응시이력(실데이터). 점수·리포트는 평가 모듈
    │   ├── batches/page.tsx     #   회차 현황
    │   └── batches/[id]/page.tsx#   회차 상세 — 응시자 목록·제출 현황
    └── admin/                   # ── admin (사내: 개발자·기획자·영업, 풀권한)
        ├── orgs/page.tsx        #   대학(고객사) 관리
        ├── batches/page.tsx     #   회차 개설·로스터 import·계정 발급
        ├── batches/[id]/page.tsx#   회차 상세 — 운영 액션(마감 연장·무효) + attempt_events 타임라인
        ├── students/page.tsx    #   전체 학생/계정 관리
        ├── problems/page.tsx    #   문제·버전 업로드·관리(최소)
        ├── submissions/page.tsx #   제출물 수집·검증 현황(평가 결과는 평가 모듈)
        └── submissions/[id]/page.tsx# 제출 상세 — 파일 메타·검증 상태·신뢰 배지
```

체크리스트
- [ ] route group 3개: `(marketing)`(공개) / `(exam)`(풀스크린) / `(app)`(대시보드 셸)
- [ ] 메뉴 중앙 배열 1곳 + `menu.filter(role)`, `usePathname()` 활성표시
- [ ] 셸 = props 주입형 순수 부품, 비즈니스 로직 없음 / 초기데이터 서버fetch, 상호작용 zustand
- [ ] 골격 먼저(라우트·메뉴+ComingSoon), mock fallback. `@app/ui` 킷으로 조립
- [ ] ⭐ 뼈대 화면은 **점수/리포트를 모른다**(진행·제출 현황만). 점수·리포트 route는 평가 모듈이 소유
- [ ] ⭐ 시험 런타임(hosted)은 오직 `exam/[attemptId]` 한 곳

---

## 2. 역할 · 조직 모델 (→ [04](./reference/04-user-role.md) 확장)

사내 인원(개발자·기획자·영업)은 전부 `admin`(영업도 admin 동급). 고객(대학)은 `org_admin`으로 **자기 대학만**.

| 역할 id | 라벨 | 보는 범위 | 핵심 |
|---|---|---|---|
| `examinee` | 학생/응시자 | 자기 시험·자기 리포트 | 응시 |
| `org_admin` | 학교담당자(고객) | **자기 대학의** 학생·현황만 | 조직 스코프 |
| `admin` | 내부 관리자(개발자·기획자·영업) | 전체 + 관리 | 사내 풀권한, 감사로그 |
| `author`,`grader` | 출제/평가 | (별도 평가 모듈) | 역할만 예약 |

```
organization(대학) ─< batch(회차=동시 50명) ─< attempt >─ examinee
org_admin ── org_members(org_role) ── organization   (자기 org만)
```

체크리스트
- [ ] `core/roles.ts`: id(영문)↔라벨(한글) 분리, `ROLE_HOME`
- [ ] 전역 역할은 `auth.user_roles`(M:N). **조직 범위 권한은 `auth.org_members.org_role`로** — `examinee`/`org_admin`은
      org 단위 부여. 로그인 시 (전역 역할 + 소속 org/org_role)을 세션/JWT에 적재
- [ ] ⭐ **org 스코프 = service에서 강제**: org 쿼리는 `org_id IN (내가 org_admin인 org들)`. 전역 role만으로 스코프하지 말 것
      (한 사람이 여러 org에 속해도 누수 없게) — A대학이 B대학 못 봄
- [ ] 백엔드 역할 재검사 필수(프론트는 UX). 핸들러 래퍼 `requireRole` + org 소유권 체크
- [ ] 영업 시연도 `admin` 로그인이되 **demo org/읽기전용 데이터**로(실데이터 PII 보호). 파괴행위는 step-up 확인
- [ ] 역할 모델은 제공 방식과 무관

**온보딩 방식(채택):** 관리자 사전 발급형 — 두 경로 모두 신규 계정에 임시비밀번호 1회 노출 → 전달, 첫 로그인 시 `change-password` 강제 변경.
  ① **담당자(org_admin)**: admin이 `admin/orgs` "담당자 발급"으로 기관·이름·이메일 입력 → org_admin 계정 생성(기존 이메일이면 권한만 부여).
  ② **학생(examinee)**: `admin/batches` 로스터 import(엑셀/CSV) → `users` + `org_members` + `attempts` 멱등 생성(특정 회차 배정).
이메일 소유 인증은 의도적 미구현(전달 채널 신뢰). 인증: bcrypt 비밀번호 해시 + HMAC 서명 세션 쿠키(httpOnly).
**온보딩 방식(미채택):** 자체 회원가입, 고유번호 입장 방식 — 현 설계 범위 밖.

---

## 3. 데이터 모델 스케치 (→ [02](./reference/02-db-schema.md) 규칙 준수)

**경계:** `auth`·`organizations`·`exam.{batches,problems,problem_versions,attempts,submissions,submission_files,attempt_events}`
= 코어. **`hosted.slots`** = 호스팅 어댑터 전용(별도 schema). **평가·리포트(`grading`)는 별도 모듈** — 코어엔 `accepted된
submission`이라는 입구만.

```sql
-- auth: 정체성 + 조직
CREATE TABLE auth.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, code TEXT UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,           -- soft delete(시험 기록 보존)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE auth.org_members (                       -- 사용자 ↔ 조직 + 조직 내 역할
  org_id UUID NOT NULL REFERENCES auth.organizations(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL,                              -- auth.users.id (약한참조)
  org_role TEXT NOT NULL DEFAULT 'examinee' CHECK (org_role IN ('examinee','org_admin')),
  PRIMARY KEY (org_id, user_id)
);
-- auth.users (참고): + is_active BOOLEAN, + external_id TEXT(학번 등, org 내 UNIQUE)

-- exam: 문제 + 불변 버전 + 회차 + 응시
CREATE TABLE exam.problems (
  code TEXT PRIMARY KEY,                              -- 'planning'
  role_track TEXT NOT NULL CHECK (role_track IN ('planning','dev','marketing')),
  title TEXT NOT NULL, is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE exam.problem_versions (                  -- ⭐ 불변 스냅샷(재현·공정성)
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_code TEXT NOT NULL REFERENCES exam.problems(code) ON DELETE RESTRICT,
  version INT NOT NULL,
  public_scaffold_ref TEXT NOT NULL,                 -- 공개 골격만(hidden은 여기 두지 않음)
  scaffold_sha256 TEXT NOT NULL, published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_problem_version UNIQUE (problem_code, version)
);
CREATE TABLE exam.batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES auth.organizations(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  problem_version_id UUID NOT NULL REFERENCES exam.problem_versions(id) ON DELETE RESTRICT,  -- 불변 FK
  capacity INT NOT NULL DEFAULT 50,                  -- 동시 응시 상한(회차). 인원 많으면 회차 분할
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','open','closed')),
  scheduled_at TIMESTAMPTZ, opened_at TIMESTAMPTZ, closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE exam.attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES exam.batches(id) ON DELETE RESTRICT,
  examinee_id TEXT NOT NULL,                          -- auth.users.id (약한참조)
  status TEXT NOT NULL DEFAULT 'ready'                -- ⭐ 평가상태 없음(grading 모듈 소관)
    CHECK (status IN ('ready','running','submitted','expired','void')),
  starts_at TIMESTAMPTZ, deadline_at TIMESTAMPTZ,     -- ⭐ 서버강제 마감(제출 API가 트랜잭션서 재판정)
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_attempt UNIQUE (batch_id, examinee_id)
);

-- ⭐ exam.submissions = 뼈대의 최종 산출물 = 평가 모듈의 단일 입구. 'accepted'만 평가 대상.
CREATE TABLE exam.submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL UNIQUE REFERENCES exam.attempts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','validating','accepted','rejected')),
  tool TEXT, chat_format_version INT NOT NULL DEFAULT 1,
  captured_via TEXT NOT NULL CHECK (captured_via IN ('proxy')),   -- hosted 프록시 캡처 단일(0009)
  trust TEXT NOT NULL DEFAULT 'verified'              -- ⭐ 서버가 어댑터 신원으로만 산출(클라 설정 불가)
    CHECK (trust IN ('verified')),
  validation_error TEXT, accepted_at TIMESTAMPTZ, submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE exam.submission_files (                  -- 대화로그/산출물 실물 메타(실물은 오브젝트 스토리지)
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES exam.submissions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('chat_log','artifact')),
  ref TEXT NOT NULL, sha256 TEXT NOT NULL, size_bytes BIGINT NOT NULL, mime TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE exam.attempt_events (                    -- 감사/관측 (append-only)
  id BIGSERIAL PRIMARY KEY,
  attempt_id UUID NOT NULL REFERENCES exam.attempts(id) ON DELETE CASCADE,
  type TEXT NOT NULL, detail JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- hosted 어댑터 전용 (별도 schema! 코어는 이 schema를 모름)
CREATE TABLE hosted.slots (
  batch_id UUID NOT NULL REFERENCES exam.batches(id) ON DELETE CASCADE,
  slot_no INT NOT NULL,
  attempt_id UUID UNIQUE REFERENCES exam.attempts(id),   -- 1 attempt = 1 slot
  state TEXT NOT NULL DEFAULT 'down' CHECK (state IN ('down','warming','ready','assigned')),
  endpoint TEXT, last_heartbeat_at TIMESTAMPTZ,
  PRIMARY KEY (batch_id, slot_no)
  -- 앱 레이어에서 slot.batch_id == attempt.batch_id 일치 검증
);

-- 인덱스(02 §6): FK·필터·최신순
CREATE INDEX idx_orgmem_user   ON auth.org_members(user_id);
CREATE INDEX idx_batch_org     ON exam.batches(org_id);
CREATE INDEX idx_att_batch     ON exam.attempts(batch_id);
CREATE INDEX idx_att_examinee  ON exam.attempts(examinee_id);
CREATE INDEX idx_att_status    ON exam.attempts(status);
CREATE INDEX idx_sub_status    ON exam.submissions(status);
CREATE INDEX idx_subfile_sub   ON exam.submission_files(submission_id);
CREATE INDEX idx_evt_att       ON exam.attempt_events(attempt_id, created_at);
```

> ⚠️ 위 DDL은 **0009(BYOD 폐기) 반영본**이다: `batches`/`attempts`의 `delivery_mode` 제거, `submissions.captured_via`=`proxy`만, `trust`=`verified`만(기본 verified). 원본 `0003`에는 byod 값이 있었으나 [`0009_drop_byod.sql`](../db/migrations/0009_drop_byod.sql)에서 제거됐다.

- ⭐ **slot_no가 attempts에서 빠지고 `hosted` schema로 격리** → 호스팅 인프라가 코어와 독립, attempt는 무관하게 유지.
- ⭐ **CASCADE 축소:** org/batch/problem은 `ON DELETE RESTRICT` + `is_active` soft-delete(시험·분쟁·재현 데이터 보호).
  CASCADE는 "같이 죽는" attempt→submissions/events에만.
- 계정 발급: `admin/batches` **로스터 CSV import**(아래 운영 표) → users + org_members(examinee) + attempts 멱등 생성.
- AI 대화·산출물 실물 = 오브젝트 스토리지, DB엔 메타·sha256·ref만. **hidden 테스트/정답은 코어/클라/슬롯에 절대 없음**
  — `grading` 모듈의 server-only namespace에만, signed URL 발급 금지(05).
- 평가·리포트(`grading.*`)는 **`accepted` submission만 입력**으로 02 §10·§12에 준해 나중에 독립 제작.

---

## 4. 핵심 사용자 플로우

**학생 응시 — hosted 단일 런타임**
```
로그인 → my/exams → [시작](starts_at·deadline_at 서버설정) → exam/[id]/intro(규칙·환경점검)
 → exam/[id]  ── hosted: 웹 IDE iframe(code-server+claude code) · 카운트다운 · [제출]
 → 서버가 deadline 재판정 → submission(received→validating→accepted/rejected) → done → (평가 모듈 후) reports
```
**학교담당자(고객)**: org/dashboard(자기 대학 응시·제출 현황) → org/students → org/students/[id]
**관리자(사내)**: admin/orgs → admin/batches(개설·로스터 import·계정) → 운영 → admin/submissions(검증 현황). 영업 시연=demo org
**영업 시연(비로그인)**: (marketing) 랜딩 → how-it-works → sample-report

체크리스트
- [ ] 시험 런타임은 `exam/[id]` 한 화면뿐. intro/done/대시보드는 점수를 모름
- [ ] 제한시간 = **서버 강제**: `deadline_at` 기준, 제출 API가 트랜잭션서 재판정(만료=hosted 접속차단). 관리자 연장은 이벤트로 기록
- [ ] 상태 화면 전부: 로딩/빈(0명·미시작)/에러(컨테이너 실패·업로드 실패·검증 실패)/부분/성공
- [ ] 온보딩: **관리자 사전 발급형**(로스터 CSV import → 임시비번 발급 → 학생 전달 → 첫 로그인 시 `change-password` 강제). 자체 회원가입·매직링크는 미채택. — §아래 운영 표
- [ ] 시험 화면 모바일 비대상 → 모바일 접속 차단 안내. 그 외 반응형(08)

운영 데이터(로스터/온보딩, 9월 P0)
```sql
-- 재실행 가능한 import 추적
CREATE TABLE ops.roster_imports (id UUID PK, batch_id UUID, status TEXT, summary JSONB, created_by TEXT, created_at TIMESTAMPTZ);
CREATE TABLE ops.roster_import_rows (id BIGSERIAL PK, import_id UUID, raw JSONB, result TEXT, error TEXT);
-- 초대/임시자격: auth.invitations(token, user_id, expires_at) 또는 password_reset_tokens. users.is_active로 비활성.
```

---

## 5. ⭐ 제공 방식과 코어의 분리 (Delivery Adapter)

**원칙(정확히):** submission **하류**(평가·리포트·대시보드·웹)는 제공 방식을 모른다. 어댑터의 계약 =
"attempt에 대해 **accepted된 정규화 Submission**(대화로그+산출물+출처+신뢰)을 만든다." 전달방식은 hosted 단일이다(BYOD 폐기).

```
        ┌──────────── 코어 ────────────┐        ┌─ 후속 모듈 ─┐
정체성/역할/org · 회차/응시 · submissions ─→ │ 평가·리포트  │ → 대시보드/웹
        └──────▲───────────────────────┘        └────────────┘
               │ 계약: attempt → accepted Submission   (하류는 제공 방식 모름)
   ┌───────────┴───────────┐
            [hosted] proxy, verified
```

### 5.0 정규화 대화 로그 포맷 (linchpin — v1 스키마 파일로 고정 + contract test = P0)
```jsonc
{ "version":1, "tool":"claude-code", "model":"...",
  "messages":[ {"id":"...","index":0,"role":"user|assistant","content":"...","ts":"...",
                "tool_calls":[...],"attachments":[...]} ],
  "meta":{ "attemptId":"...","source":"proxy","sourceHash":"sha256:..." } }
```
- 호스팅 프록시가 **이 스키마**로 출력. 플랫폼은 **JSON Schema 검증 + accepted/rejected fixture + validator**를
  P0로 보유(**출력 계약 검증은 플랫폼 책임**). 평가 모듈은 이 한 포맷만 소비.

### 5.1 어댑터 — hosted (premium, 9월 목표)
```
학생 브라우저 → exam 페이지(iframe 래퍼) → 격리 컨테이너[code-server + claude code(BASE_URL→프록시) + scaffold]
 → LLM 프록시(우리 키·attempt_id 태깅·전 요청응답 로깅·비용상한·egress allowlist) → 정규화 → submission(proxy, 서버가 trust 판정)
```
- 이미지(환경)↔문제(데이터) 분리, `PROBLEM_ID`로 시드. **풀 단위 스케일 0↔50**(동시-창). 健康 3층(ArgoCD 배포 / k8s probe 자동치유 / 앱 heartbeat 배정). seeder 부팅 wipe+재시드로 초기화. 자원·매니페스트·GitOps 운영 경로(누가 manifest 커밋·sync polling·장애 복구)는 **`2-exam-environment.md`로** 위임.
- ⚠️ proxy라고 무조건 신뢰 아님: **egress allowlist + per-attempt 로그 무결성 + 서버측 artifact 패키징/해시**가 verified의 전제(§11).

### 5.2 신뢰 모델
- **trust는 서버가 어댑터 신원에서만 산출**(클라가 못 정함). 호스팅 proxy 캡처는 서버가 대화를 직접 산출하므로 `verified`(단 §5.1 전제).
- (후속) 평가·리포트는 `submissions.trust`로 신뢰배지를 붙인다. 신뢰는 어댑터 신원에서만 나오므로 코어 스키마에 `trust`로 박는다.

> **성숙 단계:** ① 로컬 Docker 스파이크(hosted 핵심 루프, Docker만) → ② 사내망 k3s+ArgoCD 스케일 풀(git만) →
> ③ 동시 batch 50 초과 시 동적 오케스트레이터. 상세 = `2-exam-environment.md`.

---

## 6. 페이지 인벤토리 & 우선순위 (9월, 뼈대)

| 우선 | 화면 | 비고 |
|---|---|---|
| P0 | `exam/[attemptId]`(hosted)+intro/done | hosted=화면 자리표시(인프라 미구현). submission(accepted) 흐름 |
| P0 | `login` + 역할 라우팅 | ROLE_HOME. bcrypt+HMAC 서명 세션 구현 완료 |
| P0 | `change-password` | 첫 로그인 임시비번 변경. 구현 완료 |
| P0 | `admin/batches` 개설 + 로스터 import·계정 | 운영 진입점. `admin/batches/[id]` 상세(운영 액션·attempt_events 타임라인) 포함 |
| P0 | 정규화 포맷 **validator + fixture**(비-UI) | seam 무결성. hosted 프록시 출력 검증 |
| P1 | `org/dashboard`,`org/students(/[id])` | 자기 대학 응시·제출 현황. `org/students/[id]` 실데이터 구현 완료(점수는 평가 모듈 후 placeholder) |
| P1 | `org/batches/[id]` | 회차 상세 — 응시자 목록·제출 현황 |
| P1 | `(marketing)` 랜딩 + `sample-report` | 영업 자료 |
| P2 | `my/exams` · `my/lecture`(공통 인터넷강의, 목데이터) · `admin/orgs`,`admin/students`,`admin/submissions(/[id])` | 시험목록·관리·제출 검증현황 |
| P3 | `admin/problems`(버전) · `how-it-works`·`curriculum` | 문제 관리·마케팅 보강 |
| — | 점수·`my/reports/[id]` 렌더 | **평가·리포트 모듈 소관**(별도 트랙). 뼈대엔 placeholder(실 DB 메타 구조만) |

**강의:** `my/lecture` = 모든 회차 공통 인터넷 강의(바이브코딩 동영상). 현재 mock 화면(목데이터), DB 모델·진도는 추후 확장.

---

## 7. 개발 단계 (→ [00 마스터 체크리스트](./reference/00-master-checklist.md))

- **Phase 0~3**(뼈대·DB·인증·UI): 00 그대로. + 역할 `org_admin`(org_members.org_role), 테이블 org/problem(+version)/batch/
  attempt/**submissions(+files)**/attempt_events/ops.roster_*, hosted.slots(어댑터 전용).
- **Phase 4**(페이지): §1 사이트맵 골격 → P0부터. `exam/[id]`는 hosted 런타임. 화면은 진행·제출 중심.
- **제공 어댑터(hosted, 크리티컬)**: Docker 스파이크 → 프록시·seeder → 런타임 → k3s 풀 → 50 동시 리허설.
- **평가·리포트 모듈(별도 트랙, 본 문서 밖)**: `grading` schema·평가·리포트 페이지. 입력 = `accepted` submission + problem_version.
- **운영/법**: PII 동의·보관(대화로그·submission), "취업 활용" 문구 톤다운, 운영 런북(on-call·장애·슬롯/업로드 실패·import 오류).

---

## 8. 스코프 경계

**In(뼈대):** 3청중 웹, 코어(org/problem+version/batch/attempt/**accepted submission+files**), hosted 어댑터의 플랫폼 측
(hosted 연동·프록시 캡처), 정규화 포맷 검증(validator/fixture/contract), 로스터 import·온보딩.
**Out(별도/보류):**
- ⛔ **평가·평가 리포트 모듈은 이 사이트(웹 플랫폼)에 포함하지 않는다.** 별도 외부 시스템(**AI-TEST 평가 시스템**)이
  `accepted submission`을 입력으로 받아 평가하고 **리포트(HTML→PDF)를 생성**한다. 이 사이트는 그 결과를 **보여주거나
  링크**할 뿐이며, `grading` schema·평가 로직·점수 계산은 이 레포에 두지 않는다. 뼈대는 `accepted submission`까지.
  - 사이트 내 `my/reports/[id]`는 외부 리포트 자리표시(실 DB 메타만), `sample-report`는 **외부 리포트의 예시(정적 재현)**.
- hosted **인프라 상세**(자원·매니페스트·GitOps 운영 경로) → `2-exam-environment.md`.
- 출제 작성 도구, 기획 외 직무, 1기 백분위(절대점수+목표 60), 구독 선물(API키), per-student 동적 오케스트레이터.

---

## 관통 적용 (대원칙 5 + 분리)
① 경계를 이름으로 — route group·역할·DB schema(+`hosted` 분리)·코어/어댑터/평가 3분리 ② 불변식은 DB가 —
`uq_attempt`, `submissions.attempt_id UNIQUE`, `slots.attempt_id UNIQUE`, problem_version 불변 FK, RESTRICT+soft-delete,
FK·CHECK ③ 단순함은 선택 — 사내 1역할(admin), 풀 스케일링, 평가·인프라 분리 ④ 패턴 > 도구 — 06/04/02 이식
⑤ 클라 입력은 적대적 — deadline·소유권·**trust는 서버가 판정**, hidden은 코어에 없음, trust는 어댑터 신원에서만 산출.

> ⭐ **분리 세 줄:** (1) 하류(평가·리포트·대시보드·웹)는 제공 방식을 모른다 — 어댑터 계약만 지키면 됨. (2) 뼈대의 끝 =
> `accepted submission(+불변 problem version + 출처/trust)`; 평가·리포트는 그걸 입력으로 하는 별도 모듈. (3) hosted 인프라는
> `hosted` schema + §11로 격리 — 코어는 그 schema를 모르고, 인프라가 바뀌어도 코어 무변경.

---

## 구현 현황 메모 (2026-06)

> 사실 기반 스냅샷. 불확실한 항목은 보수적으로 기재.

| 영역 | 상태 | 비고 |
|---|---|---|
| DB 스키마 (5개 마이그레이션) | 완료 | `auth`·`exam`·`hosted`·`ops` schema 적용 |
| 인증 (bcrypt + HMAC 세션) | 완료 | login, change-password(첫 로그인 강제) |
| 온보딩 방식 | **관리자 사전 발급형** 채택 | 로스터 CSV → 임시비번 → 전달. 자체 회원가입 미채택 |
| 이메일 소유 인증 | **의도적 미구현** | 전달 채널 신뢰 방식으로 확정 |
| `my/exams` | 완료(실데이터) | DataTable, AttemptStatusTag, SubmissionStatusTag |
| `my/lecture` | 목데이터 화면 | DB 모델·진도 미구현, 추후 확장 |
| `my/reports/[id]` | placeholder | 평가 모듈 별도 트랙 |
| `org/dashboard` | 완료(실데이터) | 자기 대학 응시·제출 집계 |
| `org/students` | 완료(실데이터) | DataTable + 이름 셀 링크 |
| `org/students/[id]` | 완료(실데이터) | 기본정보 + 응시이력 표. 점수·리포트 placeholder |
| `org/batches(/[id])` | 현황 화면 구현 | 상세 포함 |
| `admin/batches(/[id])` | 완료 | 개설·로스터 import·계정 발급. 상세에 운영 액션(연장/무효) + attempt_events 타임라인 |
| `admin/submissions(/[id])` | 검증 현황 구현 | 평가 결과는 평가 모듈 소관 |
| `exam/[id]` (hosted) | 화면 자리표시 | 인프라(컨테이너·프록시) 미구현. 전달방식 hosted 단일(BYOD 폐기) |
| 평가·리포트 모듈 | **이 사이트 밖** | 외부 AI-TEST 시스템이 평가·리포트(HTML→PDF) 생성. 사이트는 결과만 표시/링크 |
| `sample-report` | 완료(외부 리포트 예시 재현) | report_예시 기반 정적 문서(마룬/오렌지), 인쇄→PDF 가능 |
| `showcase` / `console` | dev 전용 | 디자인 쇼케이스·프로토타입. 프로덕션 미노출 |
