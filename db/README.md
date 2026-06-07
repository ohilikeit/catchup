# db — 단일 PostgreSQL 스키마 & 마이그레이션

CatchUP 플랫폼의 데이터 계층. **단일 DB 안을 도메인별 Postgres schema로 분리**한다
(근거: [../docs/reference/02-db-schema.md](../docs/reference/02-db-schema.md), [../docs/1-web-platform-planning.md](../docs/1-web-platform-planning.md) §3).

## schema 경계

| schema | 소유 | 내용 |
|---|---|---|
| `auth` | 정체성 | `users`, `user_roles`(전역), `organizations`, `org_members`(org 역할), `invitations` |
| `exam` | **코어** | `problems`, `problem_versions`(불변), `batches`, `attempts`, `submissions`(seam), `submission_files`, `attempt_events` |
| `hosted` | hosted 어댑터 전용 | `slots` — BYOD면 미사용. 코어는 이 schema를 모름 |
| `ops` | 운영 | `roster_imports`, `roster_import_rows` |
| `grading` | (별도 모듈) | 뼈대에서 **생성하지 않음**. `accepted` submission만 입력으로 후속 제작 |

> ⭐ 뼈대의 끝 = `exam.submissions`(accepted) + 불변 `problem_version` + `trust`. 평가·리포트(`grading.*`)는
> 이 입구를 소비하는 별도 트랙이라, 제공 방식(hosted↔byod)이 바뀌어도 이 스키마는 무변경.

## 로컬 실행

```bash
cp .env.example .env.secret   # 루트에서 1회 (DATABASE_URL/REDIS_URL 기본값 OK, gitignore됨)
docker compose up -d          # postgres 16 + redis 7 (healthy까지 대기)
pnpm db:migrate               # db/migrations/*.sql 순서대로 적용
pnpm db:migrate:status        # 적용/미적용 목록
```

## 마이그레이션 규칙

- 파일명: `NNNN_description.sql` — **4자리 접두 순서가 곧 적용 순서**.
- 러너([migrate.mjs](./migrate.mjs))가 각 파일을 **트랜잭션으로** 적용하고 `public._migrations`에 기록(멱등).
- 적용된 파일은 **수정하지 말 것** — 변경은 항상 새 마이그레이션으로(append-only).
- 데이터 변환을 동반하는 변경은 reference/02 §13의 6원칙(백업 테이블 → 변환 → 검증 후 삭제)을 SQL 안에서 직접 따른다.

## repository에서 쓰는 법

SQL은 `apps/web/lib/db/repositories/*` 한 곳에만 가둔다(reference/01 §5, 02 §14):
`$1` 파라미터 바인딩 필수, snake_case↔camelCase 행 매퍼, 동적 UPDATE 빌더, `RETURNING *`.
`apps/web/lib/db/repositories/organizations.ts` 가 그 패턴의 레퍼런스 구현이다.
