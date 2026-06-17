---
type: Architecture Decision
title: DB 스키마 설계 원칙
description: 단일 PostgreSQL + 도메인별 schema 분리, PK 용도별 선택, audit 트리거, JSONB 규칙, 인덱스 5원칙, FK 경계 전략, 비동기 잡 큐, 마이그레이션 6원칙.
resource: file:///docs/reference/02-db-schema.md
tags:
  - database
  - postgresql
  - schema-design
  - migrations
timestamp: 2026-06-17T00:00:00Z
---

# DB 스키마 설계 원칙

구체적인 테이블 정의는 [/database/](/database/) 도메인(아직 미작성)에 있다.
이 문서는 **왜** 그런 구조를 택했는지 — 설계 결정과 그 근거 — 를 담는다.

마이그레이션 파일의 위치는 `db/migrations/`, 런너는 `db/migrate.mjs`이며
DB 코드(service/repository)는 `apps/web/lib/db/`에 위치한다.

## 결정 1: 단일 DB + 도메인별 schema

DB는 1개, 그 안을 Postgres **schema**(namespace)로 도메인 분리한다.

```sql
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS exam;
CREATE SCHEMA IF NOT EXISTS grading;
```

- `public`에 전부 넣지 말 것. 경계가 이름에 보여야 한다(관통 대원칙 1).
- 이점: 나중에 도메인 분리가 쉬움, schema 단위 권한 부여 가능.
- 테이블 참조는 항상 `schema.table` 형식 (예: `exam.submissions`).

> **구현 현황**: `db/migrations/0001_init_schemas.sql`에 `auth`, `exam`, `hosted`, `ops` 4개 schema가 생성된다. `grading` schema는 **현재 미생성** — 마이그레이션 주석에 "평가·리포트 모듈(별도 트랙)이 소유 → 뼈대에서 생성하지 않음"으로 명시되어 있다. 구현된 테이블 목록: `auth.users`, `auth.user_roles`, `auth.organizations`, `auth.org_members`, `auth.invitations` / `exam.problems`, `exam.problem_versions`, `exam.batches`, `exam.attempts`, `exam.attempt_events`, `exam.submissions`, `exam.submission_files` / `hosted.slots`, `hosted.entry_queue` / `ops.roster_imports`, `ops.roster_import_rows`.

## 결정 2: 상태값 — CHECK로 시작, 굳으면 ENUM

```sql
-- 초기 (자주 바뀜): VARCHAR + CHECK ── 값 추가/삭제 쉬움
status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','closed'))
```

ENUM은 값 삭제가 어렵다. 비즈니스 규칙이 굳어진 후에만 ENUM으로 전환을 고려한다.

## 결정 3: Primary Key — 용도별 선택

| 용도 | PK 타입 | 이유 |
|---|---|---|
| 사용자 노출 핵심 엔티티 (시험, 답안, 평가) | `UUID DEFAULT gen_random_uuid()` | 추측 불가(보안), URL 노출 안전 |
| 설정/룩업 테이블 (문항 유형, 카테고리) | 의미있는 `TEXT` | 읽으면 뜻을 앎 |
| 추가만 되는 로그/이벤트 | `BIGSERIAL` | 순번이면 충분 (`SERIAL`은 21억 한계) |

## 결정 4: Audit 컬럼 + updated_at 자동 트리거

모든 테이블에 `TIMESTAMPTZ` audit 컬럼을 추가한다 (`TIMESTAMP`가 아님 — TZ 필수).

`updated_at`은 앱 코드에 의존하지 않고 **DB 트리거로 자동 갱신**한다(관통 대원칙 2).
트리거 함수는 단일 DB이므로 `public` schema에 1개만 공유한다:

```sql
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
```

## 결정 5: JSONB — 모양이 변하는 데이터

규칙: **검색/조인/집계할 값 = 컬럼**, **모양이 매번 다른 덩어리 = JSONB**.

AI 평가에서 JSONB 적합 데이터: 시험 설정(`config`), 답안(`answers`), 루브릭(`rubric`), AI 원본 출력(`result`).

⚠️ **점수/상태/응시자 ID 등 검색·정렬할 값은 반드시 별도 컬럼으로.** JSONB에 숨기면 느리다.

## 결정 6: 인덱스 5원칙

```sql
-- ① 모든 FK
CREATE INDEX idx_sub_test ON exam.submissions(test_id);
-- ② 자주 필터하는 컬럼
CREATE INDEX idx_sub_status ON exam.submissions(status);
-- ③ 최신순 목록
CREATE INDEX idx_sub_created ON exam.submissions(created_at DESC);
-- ④ 복합 (등호 컬럼 앞, 범위 뒤)
CREATE INDEX idx_sub_test_status ON exam.submissions(test_id, status);
-- ⑤ 부분 인덱스 (뜨거운 행만)
CREATE INDEX idx_jobs_queued ON grading.jobs(created_at) WHERE status='queued';
```

⚠️ 인덱스는 쓰기를 느리게 한다. **쿼리를 먼저 파악하고** 필요한 것만 추가한다.

## 결정 7: FK와 도메인 경계

```sql
-- 도메인 내부: "같이 살고 죽는" 관계 → 강한 FK + CASCADE
submission_id UUID NOT NULL REFERENCES exam.submissions(id) ON DELETE CASCADE

-- 도메인 간: 독립 존재 → 약한 참조 (FK 제약 없음, 주석으로만)
created_by TEXT NOT NULL,  -- auth.users.id (FK 제약 없음)
```

약한 참조는 DB가 무결성을 보장하지 않으므로 **service 레이어가 책임**진다.

## 결정 8: 비동기 평가 잡 큐 (DB만으로 구현)

외부 메시지 큐 인프라 없이 DB 1개로 안정적인 작업 큐를 구현한다:

```sql
CREATE TABLE grading.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES exam.submissions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','succeeded','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  input JSONB NOT NULL DEFAULT '{}', result JSONB, error TEXT,
  locked_by TEXT, locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

워커가 `FOR UPDATE SKIP LOCKED`로 중복 없이 1개씩 집어간다. LLM 평가 결과 캐싱은 [cache](/platform/cache.md) 참조.

> **구현 현황: 미구현.** `grading` schema 자체가 현재 마이그레이션에 없다(결정 1 구현 현황 참조). `grading.jobs` 테이블은 평가·리포트 모듈 트랙에서 생성할 예정이다. 현재 코드베이스에 해당 테이블을 참조하는 repository나 service 코드는 없다.

## 결정 9: M:N 관계 — 복합 PK 조인 테이블

```sql
CREATE TABLE exam.test_graders (
  test_id   UUID NOT NULL REFERENCES exam.tests(id) ON DELETE CASCADE,
  grader_id TEXT NOT NULL,
  granted_by TEXT, granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (test_id, grader_id)   -- 복합 PK = 중복 부여 자동 차단 + 인덱스
);
```

역할 배정 검사는 [auth-roles](/platform/auth-roles.md)의 자원 소유권 섹션 참조.

## 결정 10: 점수 변경 이력 테이블

현재 상태는 본 테이블에 두고(빠른 조회), **모든 변경은 append-only 이력 테이블**에 기록한다.
평가는 분쟁이 잦으므로 `grading.score_history` 필수. 감사/IDOR 방어는 [security](/platform/security.md) 참조.

> **구현 현황: 미구현.** `grading.score_history` 테이블은 현재 마이그레이션에 없다. `grading` schema 전체가 평가·리포트 모듈 트랙에 속한다(결정 8 구현 현황 참조).

## 결정 11: 마이그레이션 6원칙

`db/migrations/`의 파일은 **append-only** (적용된 파일은 수정 금지). 데이터 변환 포함 마이그레이션 시:

1. 전체를 `BEGIN; ... COMMIT;` 트랜잭션으로.
2. 변경 전 **백업 테이블** 생성.
3~4. drop → 새 구조 재생성.
5. 옛 데이터를 JOIN으로 변환 이전 + `ON CONFLICT DO NOTHING` (멱등).
6. 백업은 즉시 삭제하지 말고 **검증 후 수동 삭제** (주석으로 남김).

## 결정 12: repository 필수 기법

- **파라미터 바인딩 `$1` 필수** — SQL 인젝션 차단. 문자열 연결 금지.
- **행 매퍼** — DB(snake_case) ↔ 앱(camelCase) 변환을 repository 한 곳에 가둠.
- **동적 UPDATE 빌더** — `!== undefined`인 필드만 SET (PATCH 정석).
- `RETURNING *` — INSERT/UPDATE 후 추가 SELECT 없이 결과 수신.

# Citations

1. `docs/reference/02-db-schema.md` — DB 스키마 설계 원문
2. `docs/reference/00-master-checklist.md` — Phase 1 DB 체크리스트
3. `docs/reference/03-cache.md` — AI 평가 잡 큐와 캐시 연계
4. `docs/reference/05-security.md` — IDOR·SQLi 방어, 점수 서버 계산
