---
type: PostgreSQL Table
title: hosted.entry_queue
description: 라이브 입장 대기 큐 — ready 슬롯이 없을 때 응시를 FIFO로 대기시키며 배정 즉시 행이 삭제된다.
resource: file:///db/migrations/0013_warm_pool_entry_queue.sql
tags: [hosted, queue, slot, assignment]
timestamp: 2026-06-17T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| attempt_id | UUID | PRIMARY KEY, FK → exam.attempts(id) ON DELETE CASCADE | 대기 중인 응시(응시당 최대 1행 — PK로 중복 멱등 보장) |
| batch_id | UUID | NOT NULL, FK → exam.batches(id) ON DELETE CASCADE | 소속 회차 |
| enqueued_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 입장 대기 등록 시각 |

## 인덱스

- 인덱스 `idx_entry_queue_batch`: `(batch_id, enqueued_at)` — FIFO 순서 처리 및 대기 위치 계산 최적화.

## FK 관계

- `attempt_id` → [exam.attempts](/database/exam/attempts.md) (CASCADE)
- `batch_id` → [exam.batches](/database/exam/batches.md) (CASCADE)

## 설계 비고

- 배정 컨트롤러(reconcile)가 ready 슬롯 생성 시 `SKIP LOCKED`로 head부터 원자 배정 후 행 삭제.
- `attempt_id` PK: 동일 응시의 중복 등록을 멱등하게 방지.

# Citations

- `db/migrations/0013_warm_pool_entry_queue.sql` — 테이블 생성, 인덱스 등록
