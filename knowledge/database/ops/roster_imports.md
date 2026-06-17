---
type: PostgreSQL Table
title: ops.roster_imports
description: 로스터 CSV import 작업 추적 — 부분 실패·재실행을 안전하게 처리하기 위한 멱등 import 이력 테이블이다.
resource: file:///db/migrations/0005_ops.sql
tags: [ops, roster, import]
timestamp: 2026-06-17T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | import 작업 고유 식별자 |
| batch_id | UUID | NOT NULL, FK → exam.batches(id) ON DELETE CASCADE | 대상 회차 |
| status | TEXT | NOT NULL, DEFAULT 'pending', CHECK (status IN ('pending','processing','completed','failed')) | 작업 상태 |
| summary | JSONB | NOT NULL, DEFAULT '{}' | 집계 결과: {created, skipped, errors} |
| created_by | TEXT | | 작업 생성자(auth.users.id 약한참조) |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 생성 시각 |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 마지막 수정 시각(트리거 자동 갱신) |

## 인덱스 및 트리거

- **트리거** `trg_roster_imports_updated`: `BEFORE UPDATE` 시 `public.set_updated_at()` 호출.
- 인덱스 `idx_roster_imp_batch`: `batch_id` — FK 역방향 조회 최적화.

## FK 관계

- `batch_id` → [exam.batches](/database/exam/batches.md) (CASCADE)
- [ops.roster_import_rows](/database/ops/roster_import_rows.md) — `roster_import_rows.import_id → roster_imports(id)` (CASCADE)

# Citations

- `db/migrations/0005_ops.sql` — 테이블 생성, 트리거, 인덱스 등록
