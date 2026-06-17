---
type: PostgreSQL Table
title: exam.problems
description: 문제 룩업 테이블 — 직무 트랙별 문제를 의미 있는 TEXT PK(코드)로 식별한다.
resource: file:///db/migrations/0003_exam.sql
tags: [exam, problem]
timestamp: 2026-06-17T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| code | TEXT | PRIMARY KEY | 문제 코드(예: 'planning') — 의미 있는 자연키 |
| role_track | TEXT | NOT NULL, CHECK (role_track IN ('planning','dev','marketing')) | 직무 구분 트랙 |
| title | TEXT | NOT NULL | 문제 표시 제목 |
| is_active | BOOLEAN | NOT NULL, DEFAULT TRUE | soft delete 플래그 |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 생성 시각 |

## FK 관계

- [exam.problem_versions](/database/exam/problem_versions.md) — `problem_versions.problem_code → problems(code)` (RESTRICT)

# Citations

- `db/migrations/0003_exam.sql` — 테이블 생성
