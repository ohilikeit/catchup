---
type: PostgreSQL Table
title: auth.user_roles
description: 전역 역할 M:N 조인 테이블 — admin·author·grader 사내 역할을 사용자에게 부여한다.
resource: file:///db/migrations/0002_auth.sql
tags: [auth, role, authorization]
timestamp: 2026-06-17T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| user_id | TEXT | NOT NULL, FK → auth.users(id) ON DELETE CASCADE, PK(복합) | 역할을 부여받은 사용자 |
| role | TEXT | NOT NULL, CHECK (role IN ('admin','author','grader')), PK(복합) | 전역 역할 값 |
| granted_by | TEXT | | 역할을 부여한 사용자 ID(auth.users.id 약한참조) |
| granted_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 역할 부여 시각 |

## 인덱스 및 트리거

- PRIMARY KEY: `(user_id, role)` — 복합 PK로 중복 부여 자동 차단.

## FK 관계

- `user_id` → [auth.users](/database/auth/users.md) (CASCADE)

## 설계 비고

- `examinee`, `org_admin` 역할은 org 단위이므로 [auth.org_members](/database/auth/org_members.md)에서 관리.
- `granted_by`는 cross-domain 강제를 피해 약한참조(TEXT)로 선언.

# Citations

- `db/migrations/0002_auth.sql` — 테이블 생성
