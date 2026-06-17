---
type: PostgreSQL Table
title: auth.organizations
description: 조직(기업·대학) 엔티티 — 회차와 멤버십의 소유 단위이며 소프트 삭제를 지원한다.
resource: file:///db/migrations/0002_auth.sql
tags: [auth, organization]
timestamp: 2026-06-17T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | 조직 고유 식별자 |
| name | TEXT | NOT NULL | 조직 표시 이름 |
| code | TEXT | UNIQUE | 업무 코드(대리키 id와 분리, reference/02 §8). NULL 허용 |
| is_active | BOOLEAN | NOT NULL, DEFAULT TRUE | soft delete 플래그(시험 기록 보존) |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 생성 시각 |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 마지막 수정 시각(트리거 자동 갱신) |

## 인덱스 및 트리거

- **트리거** `trg_orgs_updated`: `BEFORE UPDATE` 시 `public.set_updated_at()` 호출 → `updated_at` 자동 갱신.
- PRIMARY KEY 인덱스: `id`.
- UNIQUE 인덱스: `code`.

## FK 관계

- [auth.org_members](/database/auth/org_members.md) — `org_members.org_id → organizations.id` (RESTRICT)
- [auth.invitations](/database/auth/invitations.md) — `invitations.org_id → organizations.id` (CASCADE)
- [exam.batches](/database/exam/batches.md) — `batches.org_id → organizations.id` (RESTRICT)

# Citations

- `db/migrations/0002_auth.sql` — 테이블 생성, 트리거 등록
