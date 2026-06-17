---
type: PostgreSQL Table
title: exam.attempt_events
description: 응시 감사/관측 이벤트 로그 — append-only이며 BIGSERIAL PK로 순번을 부여한다.
resource: file:///db/migrations/0003_exam.sql
tags: [exam, attempt, audit, event]
timestamp: 2026-06-17T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | 순번 식별자(append-only, reference/02 §3) |
| attempt_id | UUID | NOT NULL, FK → exam.attempts(id) ON DELETE CASCADE | 소속 응시 |
| type | TEXT | NOT NULL | 이벤트 유형(예: started, heartbeat, crash, reconnect, uploaded, submitted) |
| detail | JSONB | NOT NULL, DEFAULT '{}' | 이벤트 상세 정보 |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 이벤트 발생 시각 |

## 인덱스

- 복합 인덱스 `idx_evt_att`: `(attempt_id, created_at)` — 응시별 최신순 조회 최적화.

## FK 관계

- `attempt_id` → [exam.attempts](/database/exam/attempts.md) (CASCADE)

## 설계 비고

- 행을 UPDATE/DELETE하지 않는 append-only 테이블. BIGSERIAL PK는 순번이면 충분(reference/02 §3).

# Citations

- `db/migrations/0003_exam.sql` — 테이블 생성, 인덱스 등록
