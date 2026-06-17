---
type: Reference
title: 마이그레이션 이력
description: db/migrations/ 디렉터리의 전체 마이그레이션 파일 목록과 각 파일이 변경한 내용 요약.
timestamp: 2026-06-17T00:00:00Z
---

# 마이그레이션 이력

`db/migrations/`는 append-only 원칙을 따른다 — 적용된 파일은 수정 금지, 변경은 항상 새 파일로.

| 파일 | 변경 내용 |
|------|-----------|
| `0001_init_schemas.sql` | 도메인별 schema 4개 생성(auth, exam, hosted, ops) + `public.set_updated_at()` 공유 트리거 함수 정의 |
| `0002_auth.sql` | auth.users, auth.user_roles, auth.organizations, auth.org_members, auth.invitations 테이블·인덱스·트리거 생성 |
| `0003_exam.sql` | exam.problems, exam.problem_versions, exam.batches, exam.attempts, exam.submissions, exam.submission_files, exam.attempt_events 테이블·인덱스·트리거 생성 |
| `0004_hosted.sql` | hosted.slots 테이블·인덱스 생성 |
| `0005_ops.sql` | ops.roster_imports, ops.roster_import_rows 테이블·인덱스·트리거 생성 |
| `0006_user_credentials.sql` | auth.users에 `password_changed_at TIMESTAMPTZ` 컬럼 추가 |
| `0007_batch_operating_mode.sql` | exam.batches에 `mode`, `window_start_at`, `window_end_at`, `time_limit_seconds` 컬럼 및 `ck_batch_window` 제약 추가 |
| `0008_slot_window_states.sql` | hosted.slots의 state CHECK에 `submitting`, `recycling` 추가 |
| `0009_drop_byod.sql` | BYOD 어댑터 폐기: exam.batches·attempts의 `delivery_mode` 컬럼 DROP, exam.submissions의 `captured_via`/`trust` CHECK에서 byod 값 제거 및 trust 기본값을 'verified'로 변경, 기존 unverified/upload 행 purge |
| `0010_batch_llm_budget.sql` | exam.batches에 `llm_budget_usd NUMERIC(10,2)` 컬럼 추가 |
| `0011_temp_password.sql` | auth.users에 `temp_password TEXT` 컬럼 추가 |
| `0012_slot_virtual_key.sql` | hosted.slots에 `virtual_key TEXT` 컬럼 추가 |
| `0013_warm_pool_entry_queue.sql` | exam.batches에 `warm_count INT` 컬럼 추가, hosted.entry_queue 테이블·인덱스 생성 |
| `0014_batch_cancelled_status.sql` | exam.batches의 status CHECK에 `'cancelled'` 추가 |

## 공유 트리거 함수

`public.set_updated_at()` — `BEFORE UPDATE` 시 `NEW.updated_at = NOW()`를 설정하는 plpgsql 함수.
아래 테이블에서 사용: auth.users, auth.organizations, exam.batches, exam.attempts, exam.submissions, ops.roster_imports.

# Citations

- `db/migrations/0001_init_schemas.sql`
- `db/migrations/0002_auth.sql`
- `db/migrations/0003_exam.sql`
- `db/migrations/0004_hosted.sql`
- `db/migrations/0005_ops.sql`
- `db/migrations/0006_user_credentials.sql`
- `db/migrations/0007_batch_operating_mode.sql`
- `db/migrations/0008_slot_window_states.sql`
- `db/migrations/0009_drop_byod.sql`
- `db/migrations/0010_batch_llm_budget.sql`
- `db/migrations/0011_temp_password.sql`
- `db/migrations/0012_slot_virtual_key.sql`
- `db/migrations/0013_warm_pool_entry_queue.sql`
- `db/migrations/0014_batch_cancelled_status.sql`
