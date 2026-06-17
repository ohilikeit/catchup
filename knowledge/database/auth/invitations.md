---
type: PostgreSQL Table
title: auth.invitations
description: 온보딩 초대·비밀번호 리셋용 1회성 토큰 — 만료 시각과 사용 시각으로 유효성을 관리한다.
resource: file:///db/migrations/0002_auth.sql
tags: [auth, invitation, token]
timestamp: 2026-06-17T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | 초대 고유 식별자 |
| token | TEXT | NOT NULL, UNIQUE | 토큰 값(해시 저장 권장, reference/05) |
| user_id | TEXT | FK → auth.users(id) ON DELETE CASCADE | 대상 사용자(NULL 허용) |
| org_id | UUID | FK → auth.organizations(id) ON DELETE CASCADE | 대상 조직(NULL 허용) |
| purpose | TEXT | NOT NULL, DEFAULT 'invite', CHECK (purpose IN ('invite','password_reset')) | 토큰 용도 |
| expires_at | TIMESTAMPTZ | NOT NULL | 만료 시각 |
| used_at | TIMESTAMPTZ | | 사용 시각. NULL = 미사용 |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 생성 시각 |

## 인덱스

- UNIQUE 인덱스: `token`.
- 인덱스 `idx_inv_user`: `user_id` — FK 역방향 조회 최적화.
- 부분 인덱스 `idx_inv_active`: `expires_at WHERE used_at IS NULL` — 미사용 토큰 만료 검사 최적화.

## FK 관계

- `user_id` → [auth.users](/database/auth/users.md) (CASCADE)
- `org_id` → [auth.organizations](/database/auth/organizations.md) (CASCADE)

# Citations

- `db/migrations/0002_auth.sql` — 테이블 생성, 인덱스 등록
