---
type: PostgreSQL Table
title: exam.attempts
description: 응시 기록 — 회차 내 수험생 1인의 응시 세션을 나타내며 서버 강제 마감(deadline_at)과 상태 머신을 포함한다.
resource: file:///db/migrations/0003_exam.sql
tags: [exam, attempt, examinee]
timestamp: 2026-06-17T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | 응시 고유 식별자 |
| batch_id | UUID | NOT NULL, FK → exam.batches(id) ON DELETE RESTRICT | 소속 회차 |
| examinee_id | TEXT | NOT NULL | 수험생 ID(auth.users.id 약한참조 — cross-domain FK 없음, reference/02 §7) |
| status | TEXT | NOT NULL, DEFAULT 'ready', CHECK (status IN ('ready','running','submitted','expired','void')) | 응시 상태 머신 |
| starts_at | TIMESTAMPTZ | | 응시 시작 시각 |
| deadline_at | TIMESTAMPTZ | | 서버 강제 마감 시각(제출 API 트랜잭션에서 재판정) |
| submitted_at | TIMESTAMPTZ | | 제출 시각 |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 생성 시각 |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 마지막 수정 시각(트리거 자동 갱신) |

## 인덱스, 트리거, 제약

- **트리거** `trg_attempts_updated`: `BEFORE UPDATE` 시 `public.set_updated_at()` 호출.
- UNIQUE 제약 `uq_attempt`: `(batch_id, examinee_id)` — 한 회차에 한 응시.
- 인덱스 `idx_att_batch`: `batch_id`.
- 인덱스 `idx_att_examinee`: `examinee_id`.
- 인덱스 `idx_att_status`: `status`.

## FK 관계

- `batch_id` → [exam.batches](/database/exam/batches.md) (RESTRICT)
- [exam.submissions](/database/exam/submissions.md) — `submissions.attempt_id → attempts(id)` (CASCADE, UNIQUE)
- [exam.attempt_events](/database/exam/attempt_events.md) — `attempt_events.attempt_id → attempts(id)` (CASCADE)
- [hosted.slots](/database/hosted/slots.md) — `slots.attempt_id → attempts(id)` (UNIQUE)
- [hosted.entry_queue](/database/hosted/entry_queue.md) — `entry_queue.attempt_id → attempts(id)` (CASCADE)

## 설계 비고

- `delivery_mode` 컬럼은 0009에서 DROP됨(hosted 단일 운영). 현재 스키마에 존재하지 않음.
- `examinee_id`는 약한참조(TEXT): cross-domain FK를 걸지 않아 exam 도메인이 auth를 몰라도 됨.
- `deadline_at`은 서버가 산출·강제하며 클라이언트가 설정 불가(대원칙 ⑤).

# Citations

- `db/migrations/0003_exam.sql` — 테이블 생성, 트리거, 인덱스
- `db/migrations/0009_drop_byod.sql` — delivery_mode 컬럼 DROP
