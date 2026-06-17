---
type: PostgreSQL Table
title: auth.org_members
description: 사용자-조직 M:N 조인 테이블 — 조직 내 역할(examinee·org_admin)과 조직 내 외부 식별자(학번)를 관리한다.
resource: file:///db/migrations/0002_auth.sql
tags: [auth, organization, membership, role]
timestamp: 2026-06-17T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| org_id | UUID | NOT NULL, FK → auth.organizations(id) ON DELETE RESTRICT, PK(복합) | 소속 조직 |
| user_id | TEXT | NOT NULL, FK → auth.users(id) ON DELETE CASCADE, PK(복합) | 소속 사용자 |
| org_role | TEXT | NOT NULL, DEFAULT 'examinee', CHECK (org_role IN ('examinee','org_admin')) | 조직 내 역할 |
| external_id | TEXT | | 이 조직 내 학번 등 외부 식별자 |
| granted_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 멤버십 부여 시각 |

## 인덱스 및 제약

- PRIMARY KEY: `(org_id, user_id)`.
- UNIQUE 제약 `uq_orgmem_external`: `(org_id, external_id)` — org 내 학번 유일(NULL은 중복 허용).
- 인덱스 `idx_orgmem_user`: `user_id` — FK 역방향 조회 최적화.

## FK 관계

- `org_id` → [auth.organizations](/database/auth/organizations.md) (RESTRICT)
- `user_id` → [auth.users](/database/auth/users.md) (CASCADE)

## 설계 비고

- 전역 역할(admin·author·grader)은 [auth.user_roles](/database/auth/user_roles.md)에서 별도 관리.

# Citations

- `db/migrations/0002_auth.sql` — 테이블 생성, 인덱스 등록
