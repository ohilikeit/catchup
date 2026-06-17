---
type: PostgreSQL Table
title: hosted.slots
description: hosted 어댑터 전용 슬롯 — 회차별 pod 슬롯의 상태 머신과 응시 배정을 추적하며 가상키도 보관한다.
resource: file:///db/migrations/0004_hosted.sql
tags: [hosted, slot, kubernetes, litellm]
timestamp: 2026-06-17T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| batch_id | UUID | NOT NULL, FK → exam.batches(id) ON DELETE CASCADE, PK(복합) | 소속 회차 |
| slot_no | INT | NOT NULL, PK(복합) | 회차 내 슬롯 번호 |
| attempt_id | UUID | UNIQUE, FK → exam.attempts(id) | 배정된 응시(NULL = 미배정, 1:1) |
| state | TEXT | NOT NULL, DEFAULT 'down', CHECK (state IN ('down','warming','ready','assigned','submitting','recycling')) | 슬롯 상태 머신(0008에서 submitting·recycling 추가) |
| endpoint | TEXT | | ClusterIP 내부 주소(학생에게 직접 노출 안 함) |
| last_heartbeat_at | TIMESTAMPTZ | | 헬스 판정 단일 근거(k8s API 회피, docs/2 §6) |
| virtual_key | TEXT | | LiteLLM 가상키(0012에서 추가). 회차 close 시 일괄 revoke |

## 인덱스

- PRIMARY KEY: `(batch_id, slot_no)`.
- UNIQUE 인덱스: `attempt_id` (1:1 배정 보장).
- 인덱스 `idx_slot_state`: `(batch_id, state)` — ready 슬롯 배정 폴링 최적화.

## FK 관계

- `batch_id` → [exam.batches](/database/exam/batches.md) (CASCADE)
- `attempt_id` → [exam.attempts](/database/exam/attempts.md) (UNIQUE, FK, NULL 허용)

## 상태 머신

모델 B(비동기 창) 재활용 흐름: `ready → assigned → submitting → recycling → ready`

모델 A(동시 버스트): 이 경로를 타지 않고 회차 종료 시 일괄 scale-down+재시드.

## 설계 비고

- `virtual_key`는 LiteLLM 게이트웨이가 발급한 예산제·단명 키(진짜 Anthropic 키 아님) — DB 보관 허용(reference/05). 유출 시 게이트웨이에서 즉시 삭제 가능.
- `slot.batch_id == attempt.batch_id` 일치는 앱 레이어에서 검증(cross-row 불변식, DB로 강제 불가).

# Citations

- `db/migrations/0004_hosted.sql` — 테이블 생성, 인덱스 등록
- `db/migrations/0008_slot_window_states.sql` — state CHECK에 submitting·recycling 추가
- `db/migrations/0012_slot_virtual_key.sql` — virtual_key 컬럼 추가
