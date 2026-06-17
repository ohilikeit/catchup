---
type: PostgreSQL Table
title: ops.roster_import_rows
description: 로스터 import 행 단위 결과 — CSV 원본 한 행과 처리 결과를 보관해 무엇이 왜 실패했는지 추적한다.
resource: file:///db/migrations/0005_ops.sql
tags: [ops, roster, import, row]
timestamp: 2026-06-17T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | 순번 식별자 |
| import_id | UUID | NOT NULL, FK → ops.roster_imports(id) ON DELETE CASCADE | 소속 import 작업 |
| raw | JSONB | NOT NULL | CSV 원본 한 행 데이터 |
| result | TEXT | NOT NULL, DEFAULT 'pending', CHECK (result IN ('pending','created','skipped','error')) | 행 처리 결과 |
| error | TEXT | | 오류 사유(result='error'인 경우) |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 생성 시각 |

## 인덱스

- 인덱스 `idx_roster_row_imp`: `import_id` — FK 역방향 조회 최적화.

## FK 관계

- `import_id` → [ops.roster_imports](/database/ops/roster_imports.md) (CASCADE)

# Citations

- `db/migrations/0005_ops.sql` — 테이블 생성, 인덱스 등록
