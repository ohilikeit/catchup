---
type: PostgreSQL Table
title: exam.problem_versions
description: 문제의 불변 스냅샷 — 재현성·공정성을 위해 회차가 참조하는 버전을 고정하며 공개 골격 참조와 SHA256만 보관한다.
resource: file:///db/migrations/0003_exam.sql
tags: [exam, problem, version, immutable]
timestamp: 2026-06-17T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | 버전 고유 식별자 |
| problem_code | TEXT | NOT NULL, FK → exam.problems(code) ON DELETE RESTRICT | 원본 문제 코드 |
| version | INT | NOT NULL | 버전 번호 |
| public_scaffold_ref | TEXT | NOT NULL | 오브젝트 스토리지 참조(공개 골격). hidden 테스트/정답은 저장 안 함(reference/05) |
| scaffold_sha256 | TEXT | NOT NULL | 공개 골격 무결성 해시 |
| published_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 버전 발행 시각 |

## 인덱스 및 제약

- UNIQUE 제약 `uq_problem_version`: `(problem_code, version)`.
- 인덱스 `idx_pv_problem`: `problem_code` — FK 역방향 조회 최적화.

## FK 관계

- `problem_code` → [exam.problems](/database/exam/problems.md) (RESTRICT)
- [exam.batches](/database/exam/batches.md) — `batches.problem_version_id → problem_versions(id)` (RESTRICT)

# Citations

- `db/migrations/0003_exam.sql` — 테이블 생성, 인덱스 등록
