---
type: PostgreSQL Table
title: exam.batches
description: 시험 회차 — 조직·문제버전·운영 모드·입장 창·LLM 예산·슬롯 풀 크기를 묶는 핵심 집합 단위이다.
resource: file:///db/migrations/0003_exam.sql
tags: [exam, batch, session]
timestamp: 2026-06-17T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | 회차 고유 식별자 |
| org_id | UUID | NOT NULL, FK → auth.organizations(id) ON DELETE RESTRICT | 소속 조직 |
| name | TEXT | NOT NULL | 회차 표시 이름 |
| problem_version_id | UUID | NOT NULL, FK → exam.problem_versions(id) ON DELETE RESTRICT | 불변 문제 버전 FK |
| capacity | INT | NOT NULL, DEFAULT 50 | 동시 응시 상한. 인원이 많으면 회차 분할 |
| status | TEXT | NOT NULL, DEFAULT 'scheduled', CHECK (status IN ('scheduled','open','closed','cancelled')) | 운영 lifecycle 상태(0014에서 cancelled 추가) |
| scheduled_at | TIMESTAMPTZ | | 예정 시각 |
| opened_at | TIMESTAMPTZ | | 회차 열린 시각 |
| closed_at | TIMESTAMPTZ | | 회차 닫힌 시각 |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 생성 시각 |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 마지막 수정 시각(트리거 자동 갱신) |
| mode | TEXT | NOT NULL, DEFAULT 'window', CHECK (mode IN ('window','burst')) | 운영 모드: window=비동기 창(기본), burst=동시 버스트(0007에서 추가) |
| window_start_at | TIMESTAMPTZ | | 학생 입장 허용 창 시작(0007에서 추가) |
| window_end_at | TIMESTAMPTZ | | 학생 입장 허용 창 종료(0007에서 추가) |
| time_limit_seconds | INT | CHECK (time_limit_seconds IS NULL OR time_limit_seconds > 0) | attempt 제한시간(초). NULL이면 공유 일정 기준(0007에서 추가) |
| llm_budget_usd | NUMERIC(10,2) | CHECK (llm_budget_usd IS NULL OR llm_budget_usd >= 0) | 1인당 LLM 예산 상한(USD). NULL=상한 없음(0010에서 추가) |
| warm_count | INT | CHECK (warm_count IS NULL OR warm_count >= 0) | 미리 띄워둘 여유 pod 수. NULL=capacity 전체(0013에서 추가) |

## 인덱스, 트리거, 제약

- **트리거** `trg_batches_updated`: `BEFORE UPDATE` 시 `public.set_updated_at()` 호출.
- **제약** `ck_batch_window`: `window_start_at IS NULL OR window_end_at IS NULL OR window_end_at >= window_start_at` (0007).
- 인덱스 `idx_batch_org`: `org_id`.
- 인덱스 `idx_batch_status`: `status`.

## FK 관계

- `org_id` → [auth.organizations](/database/auth/organizations.md) (RESTRICT)
- `problem_version_id` → [exam.problem_versions](/database/exam/problem_versions.md) (RESTRICT)
- [exam.attempts](/database/exam/attempts.md) — `attempts.batch_id → batches(id)` (RESTRICT)
- [hosted.slots](/database/hosted/slots.md) — `slots.batch_id → batches(id)` (CASCADE)
- [hosted.entry_queue](/database/hosted/entry_queue.md) — `entry_queue.batch_id → batches(id)` (CASCADE)
- [ops.roster_imports](/database/ops/roster_imports.md) — `roster_imports.batch_id → batches(id)` (CASCADE)

## 설계 비고

- `delivery_mode` 컬럼은 0009에서 DROP됨(hosted 단일 운영). 현재 스키마에 존재하지 않음.
- `status = 'cancelled'`: 응시 이력이 있는 회차의 소프트 취소 경로(0014). 하드 삭제는 `scheduled` + 응시 0건인 경우만 앱 레이어에서 허용.
- `mode`, `window_*`, `time_limit_seconds`는 코드 분기 없이 데이터 값으로만 운영 모델을 선택(0007 설계 원칙).

# Citations

- `db/migrations/0003_exam.sql` — 테이블 생성, 트리거, 인덱스
- `db/migrations/0007_batch_operating_mode.sql` — mode, window_start_at, window_end_at, time_limit_seconds 추가
- `db/migrations/0010_batch_llm_budget.sql` — llm_budget_usd 추가
- `db/migrations/0013_warm_pool_entry_queue.sql` — warm_count 추가
- `db/migrations/0014_batch_cancelled_status.sql` — status CHECK에 'cancelled' 추가
- `db/migrations/0009_drop_byod.sql` — delivery_mode 컬럼 DROP
