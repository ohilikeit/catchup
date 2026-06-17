---
type: PostgreSQL Table
title: exam.submission_files
description: 제출 파일 메타데이터 — 실물(대화로그·산출물)은 오브젝트 스토리지에 두고 DB에는 참조·SHA256·크기만 보관한다.
resource: file:///db/migrations/0003_exam.sql
tags: [exam, submission, file, storage]
timestamp: 2026-06-17T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | 파일 메타 고유 식별자 |
| submission_id | UUID | NOT NULL, FK → exam.submissions(id) ON DELETE CASCADE | 소속 제출 |
| kind | TEXT | NOT NULL, CHECK (kind IN ('chat_log','artifact')) | 파일 종류 |
| ref | TEXT | NOT NULL | 오브젝트 스토리지 참조 경로 |
| sha256 | TEXT | NOT NULL | 파일 무결성 해시 |
| size_bytes | BIGINT | NOT NULL | 파일 크기(바이트) |
| mime | TEXT | | MIME 타입 |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 생성 시각 |

## 인덱스

- 인덱스 `idx_subfile_sub`: `submission_id` — FK 역방향 조회 최적화.

## FK 관계

- `submission_id` → [exam.submissions](/database/exam/submissions.md) (CASCADE)

# Citations

- `db/migrations/0003_exam.sql` — 테이블 생성, 인덱스 등록
