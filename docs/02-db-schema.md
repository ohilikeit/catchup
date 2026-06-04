# 02. DB 스키마 설계 (단일 DB)

> 출처: `jabis-api-gateway/sql/*` (~40개 스키마), 특히 `approval`/`organization`/`finance`/`gateway` + `sql/applied/`(마이그레이션)

## 1. 단일 DB + 도메인별 schema

DB는 1개, 그 안을 Postgres **schema**(namespace)로 도메인 분리. 테이블은 `schema.table`.
```sql
CREATE SCHEMA IF NOT EXISTS exam;
CREATE SCHEMA IF NOT EXISTS grading;
-- 테이블: exam.tests, grading.jobs ...
```
- [x] `public`에 다 넣지 말 것. 도메인별 schema(`auth`,`exam`,`grading`,`analytics`).
- 이점: 경계가 이름에 보임 / 나중에 도메인 분리 쉬움 / schema 단위 권한.

## 2. 상태값: 초기엔 CHECK, 굳으면 ENUM

```sql
-- 초기 (자주 바뀜): VARCHAR + CHECK ── 값 추가/삭제 쉬움
status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','closed'))
-- 안정화 후: ENUM ── 타입 안전하지만 값 삭제가 지옥
CREATE TYPE exam.test_status AS ENUM ('draft','published','closed');
```
- [x] **CHECK로 시작**, 비즈니스 규칙이 굳으면 ENUM 고려.

## 3. Primary Key — 용도별 선택

| 용도 | PK | 이유 |
|---|---|---|
| 사용자에게 노출되는 핵심 엔티티 | `UUID DEFAULT gen_random_uuid()` | 추측 불가(보안), URL 노출 안전 |
| 설정/룩업 테이블 | 의미있는 `TEXT` (`'essay'`) | 읽으면 뜻을 앎 |
| 추가만 되는 로그 | `BIGSERIAL` | 순번이면 충분(SERIAL은 21억 한계 → BIGSERIAL) |

- [x] 시험/답안/채점 = UUID. 문항유형/카테고리 = TEXT. 이벤트로그 = BIGSERIAL.

## 4. Audit 컬럼 + updated_at 자동 트리거

```sql
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),   -- TIMESTAMP 아님! TZ 필수
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
completed_at TIMESTAMPTZ,                         -- "끝난 시점"이 의미있을 때
created_by TEXT                                   -- 누가
```
```sql
-- 공유 함수 1개 (단일 DB이므로 public에)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_x_updated BEFORE UPDATE ON exam.tests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```
- [x] 모든 테이블에 `created_at/updated_at` **TIMESTAMPTZ**.
- [x] `updated_at`은 **트리거로 자동 갱신**(앱 코드 믿지 말 것). 함수 1개 공유.

## 5. JSONB — 모양이 변하는 데이터

- 규칙: **검색/조인/집계할 값 = 컬럼**, **모양이 매번 다른 덩어리 = JSONB**.
- AI 평가: 시험설정(`config`), 답안(`answers`), 루브릭(`rubric`), AI원본출력(`result`) = JSONB.
- ⚠️ **점수/상태/응시자ID 등 검색·정렬할 값은 반드시 별도 컬럼**으로. JSONB에 숨기면 느림.

## 6. 인덱스 5원칙 (성능의 90%)

```sql
CREATE INDEX idx_sub_test        ON exam.submissions(test_id);            -- ① 모든 FK
CREATE INDEX idx_sub_status      ON exam.submissions(status);             -- ② 자주 필터하는 컬럼
CREATE INDEX idx_sub_created     ON exam.submissions(created_at DESC);    -- ③ 최신순 목록
CREATE INDEX idx_sub_test_status ON exam.submissions(test_id, status);   -- ④ 복합(=컬럼 앞, 범위 뒤)
CREATE INDEX idx_jobs_queued ON grading.jobs(created_at) WHERE status='queued'; -- ⑤ 부분 인덱스
```
- ⑤ **부분 인덱스**: "뜨거운 행"(대기중 잡, 내 결재함)만 색인 → 작고 빠름.
- ⚠️ 인덱스는 쓰기를 느리게 함. **쿼리를 먼저 알고** 필요한 것만.

## 7. 외래키와 도메인 경계 (단일 DB 핵심 판단)

```sql
-- 도메인 내부: "같이 살고 죽는" 관계 → 강한 FK + CASCADE
submission_id UUID NOT NULL REFERENCES exam.submissions(id) ON DELETE CASCADE
-- 도메인 간: 독립 존재 → 약한 참조(REFERENCES 안 검, 주석으로만)
created_by TEXT NOT NULL,  -- auth.users.id (FK 제약 없음)
```
- [x] 한 덩어리(시험-답안-채점잡) = 강한 FK+CASCADE / 도메인 간(답안↔사용자) = 약한 참조.
- ⚠️ 약한 참조는 DB가 무결성 보장 안 함 → **service 레이어가 책임**.

## 8. 정규화 — "다른 개념은 다른 테이블"

- `departments` / `employees` / `users` 3분리: "조직 / HR직원 / 로그인계정"은 **생명주기가 다른 별개 개념**.
- [x] AI평가: **"로그인 정체성(users)"과 "도메인 역할(examinees/graders)"을 분리.**
- 자기참조 계층: `parent_id REFERENCES same_table(id)` (조직도, 문항 카테고리 트리). 인접 리스트.
- 대리키+자연키: `id`(PK, 내부참조) + `code TEXT UNIQUE`(업무코드). **FK는 id로**.

## 9. 다대다(M:N): 복합 PK 조인 테이블

```sql
CREATE TABLE exam.test_graders (
  test_id   UUID NOT NULL REFERENCES exam.tests(id) ON DELETE CASCADE,
  grader_id TEXT NOT NULL,
  granted_by TEXT, granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- 관계 메타데이터
  PRIMARY KEY (test_id, grader_id)   -- 복합 PK = 중복 부여 자동 차단 + 인덱스
);
```

## 10. 상태기계 + 이력 테이블 (감사/분쟁 대비)

- 현재 상태는 본 테이블(`submissions.status`, `submissions.score`)에 — 빠른 조회.
- **모든 변경은 append-only 이력 테이블**에 기록:
```sql
CREATE TABLE grading.score_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES exam.submissions(id),
  previous_score NUMERIC(5,2), new_score NUMERIC(5,2) NOT NULL,
  changed_by TEXT NOT NULL, reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
- [x] 채점은 분쟁 잦음 → **점수 변경 이력 필수**.
- 비정규화(`current_holder` 같은 캐싱 컬럼)는 읽기 성능용, 갱신 시 트랜잭션으로 함께 변경.

## 11. 기타 필수 패턴
- **1:1** = FK에 `UNIQUE`.  **제약 이름 부여** `CONSTRAINT uq_x UNIQUE(...)`.
- **소프트 삭제** `is_active BOOLEAN DEFAULT TRUE` + 조회 시 `WHERE is_active`. (법적/감사 데이터)
- **파일은 메타데이터만 DB**(name/path/size/mime), 실물은 오브젝트 스토리지(S3/MinIO).
- **사람용 번호** 시퀀스+트리거로 `APV-2026-0001` 자동 생성(시스템키 UUID와 분리).
- **DDL은 트랜잭션으로** `BEGIN; ... COMMIT;` (Postgres는 트랜잭셔널 DDL).

## 12. ⭐ 비동기 채점 잡 큐 (DB 하나로 큐 구현)

```sql
CREATE TABLE grading.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES exam.submissions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  input JSONB NOT NULL DEFAULT '{}', result JSONB, error TEXT,
  locked_by TEXT, locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_jobs_queued ON grading.jobs(created_at) WHERE status='queued';
```
워커가 안전하게 1개씩 집기 (중복 채점 방지, MQ 인프라 불필요):
```sql
UPDATE grading.jobs SET status='running', locked_by=$1, locked_at=NOW(), attempts=attempts+1
WHERE id = (SELECT id FROM grading.jobs WHERE status='queued'
            ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
RETURNING *;
```
- [x] `FOR UPDATE SKIP LOCKED` = Postgres만으로 안정 작업큐. `apps/worker`가 폴링 처리.

## 13. 마이그레이션 6원칙 (데이터 변환 포함 변경 시)

`sql/applied/migrate-user-roles-to-employee.sql`에서 추출:
1. 전체를 `BEGIN; ... COMMIT;` 트랜잭션으로.
2. 변경 전 **백업 테이블** 생성.
3~4. drop → 새 구조 재생성.
5. 옛 데이터를 **JOIN으로 변환 이전** + `ON CONFLICT DO NOTHING`(멱등).
6. 백업은 즉시 삭제하지 말고 **검증 후 수동 삭제**(주석으로 남김).
- 도구(Prisma Migrate / Drizzle Kit)로 자동화하되, 데이터 변환 마이그레이션엔 이 SQL 패턴 직접 사용.

## 14. repository(SQL 접근) 필수 기법
- **파라미터 바인딩 `$1` 필수**(문자열 연결 금지) — SQL 인젝션 차단. ORM 쓰면 기본 보장.
- **행 매퍼**: DB(snake_case) ↔ 앱(camelCase) 변환을 repository 한 곳에 가둠.
- **동적 UPDATE 빌더**: `!== undefined`인 필드만 SET (PATCH 정석, "미전송"과 "null설정" 구분).
- `RETURNING *`로 INSERT/UPDATE 후 추가 SELECT 없이 결과 수신(트리거 채운 값 포함).
