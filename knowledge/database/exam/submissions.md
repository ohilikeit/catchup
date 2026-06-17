---
type: PostgreSQL Table
title: exam.submissions
description: 제출물 메타데이터 — 뼈대의 최종 산출물이자 평가 모듈의 단일 입구이며, accepted 상태만 평가 대상이 된다.
resource: file:///db/migrations/0003_exam.sql
tags: [exam, submission, grading]
timestamp: 2026-06-17T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | 제출 고유 식별자 |
| attempt_id | UUID | NOT NULL, UNIQUE, FK → exam.attempts(id) ON DELETE CASCADE | 연결 응시(1:1) |
| status | TEXT | NOT NULL, DEFAULT 'received', CHECK (status IN ('received','validating','accepted','rejected')) | 제출 처리 상태 |
| tool | TEXT | | 사용 도구명 |
| chat_format_version | INT | NOT NULL, DEFAULT 1 | 대화 포맷 버전 |
| captured_via | TEXT | NOT NULL, CHECK (captured_via IN ('proxy')) | 수집 방식(0009에서 'upload' 제거, 현재 'proxy'만) |
| trust | TEXT | NOT NULL, DEFAULT 'verified', CHECK (trust IN ('verified')) | 신뢰 수준(0009에서 'unverified' 제거, 기본값도 'verified'로 변경) |
| validation_error | TEXT | | 검증 실패 사유 |
| accepted_at | TIMESTAMPTZ | | accepted 상태로 전환된 시각 |
| submitted_at | TIMESTAMPTZ | | 제출 요청 시각 |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 생성 시각 |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 마지막 수정 시각(트리거 자동 갱신) |

## 인덱스 및 트리거

- **트리거** `trg_submissions_updated`: `BEFORE UPDATE` 시 `public.set_updated_at()` 호출.
- UNIQUE 인덱스: `attempt_id` (1:1 보장).
- 인덱스 `idx_sub_status`: `status`.

## FK 관계

- `attempt_id` → [exam.attempts](/database/exam/attempts.md) (CASCADE)
- [exam.submission_files](/database/exam/submission_files.md) — `submission_files.submission_id → submissions(id)` (CASCADE)

## 설계 비고

- 0009(drop_byod) 이전에는 `captured_via IN ('proxy','upload')`, `trust IN ('verified','unverified')`였으나 BYOD 폐기 후 각각 단일 값으로 제한됨.
- 0009 적용 시 기존 `captured_via = 'upload'` 또는 `trust = 'unverified'` 행은 DELETE 처리됨.

# Citations

- `db/migrations/0003_exam.sql` — 테이블 생성, 트리거, 인덱스
- `db/migrations/0009_drop_byod.sql` — captured_via/trust CHECK 변경, trust 기본값 변경, unverified 행 purge
