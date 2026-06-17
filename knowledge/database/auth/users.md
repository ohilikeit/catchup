---
type: PostgreSQL Table
title: auth.users
description: 플랫폼 로그인 계정(정체성 엔티티) — 이메일/비밀번호·매직링크 인증을 담으며, 타 도메인은 약한참조(TEXT)로만 가리킨다.
resource: file:///db/migrations/0002_auth.sql
tags: [auth, user, identity]
timestamp: 2026-06-17T00:00:00Z
---

# Schema

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY, DEFAULT gen_random_uuid()::text | 플랫폼 고유 식별자(UUID를 TEXT로 저장) |
| email | TEXT | UNIQUE | 로그인 식별자(매직링크/임시비번). NULL 가능 |
| full_name | TEXT | NOT NULL, DEFAULT '' | 사용자 표시 이름 |
| password_hash | TEXT | | bcrypt 해시. 매직링크 전용 계정이면 NULL 가능 |
| external_id | TEXT | | 학번 등 외부 식별자(org 내 UNIQUE는 org_members에서 관리) |
| is_active | BOOLEAN | NOT NULL, DEFAULT TRUE | soft delete 플래그(시험 기록 보존) |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 생성 시각 |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 마지막 수정 시각(트리거 자동 갱신) |
| password_changed_at | TIMESTAMPTZ | | 비밀번호 변경 시각. NULL = 임시비번 상태(0006에서 추가) |
| temp_password | TEXT | | 발급 임시비번 평문(관리자 조회용). 학생 비번 변경 시 NULL(0011에서 추가) |

## 인덱스 및 트리거

- **트리거** `trg_users_updated`: `BEFORE UPDATE` 시 `public.set_updated_at()` 호출 → `updated_at` 자동 갱신.
- PRIMARY KEY 인덱스: `id`.
- UNIQUE 인덱스: `email`.

## FK 관계

- [auth.user_roles](/database/auth/user_roles.md) — `user_roles.user_id → users.id` (CASCADE)
- [auth.org_members](/database/auth/org_members.md) — `org_members.user_id → users.id` (CASCADE)
- [auth.invitations](/database/auth/invitations.md) — `invitations.user_id → users.id` (CASCADE)

## 설계 비고

- `id`를 TEXT로 선언한 이유: 타 도메인(exam 등)이 cross-domain FK 없이 약한참조(TEXT 컬럼)로 가리키므로 캐스팅 불필요(reference/02 §7).
- `password_changed_at IS NULL` = 임시비번 아직 미변경 상태로 UI 배너 트리거.
- `temp_password` 평문 at-rest 허용 근거: 관리자가 발급해 학생에게 전달하는 1회용 온보딩 비번이므로 허용(reference/05). 학생 비번 변경 시 즉시 NULL.

# Citations

- `db/migrations/0002_auth.sql` — 테이블 생성, 트리거 등록
- `db/migrations/0006_user_credentials.sql` — `password_changed_at` 컬럼 추가
- `db/migrations/0011_temp_password.sql` — `temp_password` 컬럼 추가
