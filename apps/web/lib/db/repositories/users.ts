import 'server-only';
import type { PoolClient } from 'pg';
import { query, queryOne, getPool } from '../pool';
import type { GlobalRole, OrgRole } from '../../auth/roles';

// users repository — 정체성 + 전역역할 + 조직소속 조회. organizations.ts 패턴을 따른다.
// 근거: reference/02 §7(cross-domain 약한참조 — id는 TEXT), §8(정체성 vs 역할 분리), docs/1 §2.

export interface User {
  id: string;
  email: string | null;
  fullName: string;
  externalId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface UserRow {
  id: string;
  email: string | null;
  full_name: string;
  external_id: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

function mapRow(r: UserRow): User {
  return {
    id: r.id,
    email: r.email,
    fullName: r.full_name,
    externalId: r.external_id,
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function findById(id: string): Promise<User | null> {
  const row = await queryOne<UserRow>('SELECT * FROM auth.users WHERE id = $1', [id]);
  return row ? mapRow(row) : null;
}

export async function findByEmail(email: string): Promise<User | null> {
  const row = await queryOne<UserRow>('SELECT * FROM auth.users WHERE email = $1', [email]);
  return row ? mapRow(row) : null;
}

/**
 * 로그인 검증용 자격증명 조회. ⭐ password_hash는 도메인 User에 노출하지 않고
 * 이 함수로만 꺼낸다(해시가 일반 조회로 새지 않게 — reference/05).
 */
export interface Credential {
  id: string;
  email: string | null;
  fullName: string;
  isActive: boolean;
  passwordHash: string | null;
  passwordChangedAt: Date | null;
}

interface CredentialRow {
  id: string;
  email: string | null;
  full_name: string;
  is_active: boolean;
  password_hash: string | null;
  password_changed_at: Date | null;
}

function mapCredential(row: CredentialRow): Credential {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    isActive: row.is_active,
    passwordHash: row.password_hash,
    passwordChangedAt: row.password_changed_at,
  };
}

export async function findCredentialByEmail(email: string): Promise<Credential | null> {
  const row = await queryOne<CredentialRow>(
    `SELECT id, email, full_name, is_active, password_hash, password_changed_at
       FROM auth.users WHERE email = $1`,
    [email],
  );
  return row ? mapCredential(row) : null;
}

/** id로 자격증명 조회(비번 변경 시 현재 비번 검증용). */
export async function findCredentialById(id: string): Promise<Credential | null> {
  const row = await queryOne<CredentialRow>(
    `SELECT id, email, full_name, is_active, password_hash, password_changed_at
       FROM auth.users WHERE id = $1`,
    [id],
  );
  return row ? mapCredential(row) : null;
}

/** 비밀번호 변경(첫 로그인 임시비번 교체 등). password_changed_at 갱신 + 임시비번 평문 폐기(NULL). */
export async function setPassword(userId: string, passwordHash: string): Promise<void> {
  await query(
    `UPDATE auth.users SET password_hash = $2, password_changed_at = NOW(), temp_password = NULL WHERE id = $1`,
    [userId, passwordHash],
  );
}

/** 전역 역할(사내). */
export async function listGlobalRoles(userId: string): Promise<GlobalRole[]> {
  const rows = await query<{ role: GlobalRole }>(
    'SELECT role FROM auth.user_roles WHERE user_id = $1',
    [userId],
  );
  return rows.map((r) => r.role);
}

export interface UserOrgMembership {
  orgId: string;
  orgRole: OrgRole;
  orgName: string;
}

/**
 * 사용자의 조직 소속 + org_role + org 이름(조인 한 번). 로그인 세션 적재용.
 * 활성 org만(soft delete 존중).
 */
export async function listOrgMemberships(userId: string): Promise<UserOrgMembership[]> {
  const rows = await query<{ org_id: string; org_role: OrgRole; org_name: string }>(
    `SELECT m.org_id, m.org_role, o.name AS org_name
       FROM auth.org_members m
       JOIN auth.organizations o ON o.id = m.org_id AND o.is_active
      WHERE m.user_id = $1
      ORDER BY o.name`,
    [userId],
  );
  return rows.map((r) => ({ orgId: r.org_id, orgRole: r.org_role, orgName: r.org_name }));
}

/** admin/students: 사용자 + 소속 org 목록(집계). 페이지네이션. */
export interface UserWithOrgs extends User {
  orgs: { orgId: string; orgName: string; orgRole: OrgRole }[];
  /** 이 사용자의 응시 건수(약한참조 집계) — 하드 삭제 가능 판정·표시용. */
  attemptCount: number;
}

export async function listWithOrgs(opts: { limit?: number; offset?: number } = {}): Promise<UserWithOrgs[]> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;
  // org 목록은 JSON 집계로 한 행에 — N+1 회피(reference/09).
  const rows = await query<UserRow & { orgs: UserWithOrgs['orgs'] | null; attempt_count: string }>(
    `SELECT u.*,
            COALESCE(
              JSON_AGG(DISTINCT JSONB_BUILD_OBJECT('orgId', m.org_id, 'orgName', o.name, 'orgRole', m.org_role))
                FILTER (WHERE m.org_id IS NOT NULL),
              '[]'
            ) AS orgs,
            COUNT(DISTINCT a.id) AS attempt_count
       FROM auth.users u
       LEFT JOIN auth.org_members m ON m.user_id = u.id
       LEFT JOIN auth.organizations o ON o.id = m.org_id
       LEFT JOIN exam.attempts a ON a.examinee_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return rows.map((r) => ({ ...mapRow(r), orgs: r.orgs ?? [], attemptCount: Number(r.attempt_count) }));
}

/** 사용자 응시 건수(약한참조 — attempts.examinee_id 는 FK가 아니라 앱이 집계로 가드). */
export async function countAttempts(userId: string): Promise<number> {
  const row = await queryOne<{ n: string }>(
    `SELECT COUNT(*) AS n FROM exam.attempts WHERE examinee_id = $1`,
    [userId],
  );
  return Number(row?.n ?? 0);
}

/** 사용자 활성/비활성 토글(소프트 삭제 — 시험 기록 보존, 0002 주석). 반환: 성공 여부. */
export async function setActive(userId: string, isActive: boolean): Promise<boolean> {
  const res = await getPool().query(
    `UPDATE auth.users SET is_active = $2 WHERE id = $1`,
    [userId, isActive],
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * 사용자 하드 삭제. user_roles·org_members·invitations 는 ON DELETE CASCADE.
 * ⚠️ attempts.examinee_id 는 FK가 아니라(약한참조) DB가 막지 않는다 → service가 countAttempts=0 선판정.
 * 반환: 삭제된 행 수.
 */
export async function deleteUser(userId: string): Promise<number> {
  const res = await getPool().query(`DELETE FROM auth.users WHERE id = $1`, [userId]);
  return res.rowCount ?? 0;
}

/** org/students: 특정 org의 examinee 목록(조직 스코프). */
export interface OrgStudent {
  userId: string;
  fullName: string;
  email: string | null;
  externalId: string | null;
  isActive: boolean;
}

export async function listExamineesByOrg(orgId: string): Promise<OrgStudent[]> {
  const rows = await query<{
    user_id: string;
    full_name: string;
    email: string | null;
    external_id: string | null;
    is_active: boolean;
  }>(
    `SELECT u.id AS user_id, u.full_name, u.email, m.external_id, u.is_active
       FROM auth.org_members m
       JOIN auth.users u ON u.id = m.user_id
      WHERE m.org_id = $1 AND m.org_role = 'examinee'
      ORDER BY u.full_name`,
    [orgId],
  );
  return rows.map((r) => ({
    userId: r.user_id,
    fullName: r.full_name,
    email: r.email,
    externalId: r.external_id,
    isActive: r.is_active,
  }));
}

/** IDOR 방지: 이 사용자가 주어진 org들 중 하나에 examinee로 소속됐는지. */
export async function isExamineeInOrgs(userId: string, orgIds: string[]): Promise<boolean> {
  if (orgIds.length === 0) return false;
  const row = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS(
        SELECT 1 FROM auth.org_members
         WHERE user_id = $1 AND org_role = 'examinee' AND org_id = ANY($2::uuid[])
      ) AS exists`,
    [userId, orgIds],
  );
  return row?.exists ?? false;
}

/* ── 로스터 import용 트랜잭션 멱등 함수(docs/1 §4) ──────────────────────── */

/**
 * 이메일로 사용자 upsert(있으면 그 id, 없으면 생성). 반환: userId + 신규여부.
 * 신규 생성 시 passwordHash를 함께 저장(로스터 발급 임시비번 — 해시만 저장).
 * 기존 사용자는 비번을 건드리지 않는다(이미 계정·자격증명 보유).
 */
export async function upsertByEmailTx(
  client: PoolClient,
  input: { email: string; fullName: string; passwordHash?: string | null; tempPassword?: string | null },
): Promise<{ userId: string; created: boolean }> {
  const existing = await client.query<{ id: string }>('SELECT id FROM auth.users WHERE email = $1', [input.email]);
  const found = existing.rows[0];
  if (found) return { userId: found.id, created: false };
  // 신규 계정: 임시비번을 해시(인증용)와 평문(관리자 조회·전달용) 둘 다 보관. 학생이 바꾸면 평문은 NULL 처리(setPassword).
  const res = await client.query<{ id: string }>(
    'INSERT INTO auth.users (email, full_name, password_hash, temp_password) VALUES ($1, $2, $3, $4) RETURNING id',
    [input.email, input.fullName, input.passwordHash ?? null, input.tempPassword ?? null],
  );
  return { userId: res.rows[0]!.id, created: true };
}

/** org에 examinee 소속 부여(멱등 — 이미 있으면 무시). */
export async function addExamineeMembershipTx(
  client: PoolClient,
  input: { orgId: string; userId: string; externalId: string | null },
): Promise<void> {
  await client.query(
    `INSERT INTO auth.org_members (org_id, user_id, org_role, external_id)
     VALUES ($1, $2, 'examinee', $3)
     ON CONFLICT (org_id, user_id) DO NOTHING`,
    [input.orgId, input.userId, input.externalId],
  );
}

/** org에 담당자(org_admin) 소속 부여. 이미 소속이면 org_role을 org_admin으로 승격. */
export async function addOrgAdminMembershipTx(
  client: PoolClient,
  input: { orgId: string; userId: string },
): Promise<void> {
  await client.query(
    `INSERT INTO auth.org_members (org_id, user_id, org_role)
     VALUES ($1, $2, 'org_admin')
     ON CONFLICT (org_id, user_id) DO UPDATE SET org_role = 'org_admin'`,
    [input.orgId, input.userId],
  );
}

/* ── 회차 학생 추가용 후보 목록(admin) ────────────────────────────────────── */

export interface ExamineeCandidate {
  id: string;
  name: string;
  email: string;
  externalId: string | null;
  /** 이미 응시(attempt)가 있는 회차 이름들(개설순) — "1회차 · 2회차" 표시용. */
  batchNames: string[];
}

/**
 * 회차 "학생 추가" 모달의 기존 사용자 선택 후보 — 이메일 있는 활성 사용자 전체(admin 스코프).
 * 회차 이력을 같이 내려 다회차 누적(같은 계정·비번 유지) 여부를 한눈에 보이게 한다.
 */
export async function listExamineeCandidates(): Promise<ExamineeCandidate[]> {
  const rows = await query<{
    id: string;
    full_name: string;
    email: string;
    external_id: string | null;
    batch_names: string[];
  }>(
    `SELECT u.id, u.full_name, u.email, u.external_id,
            COALESCE(array_agg(DISTINCT b.name) FILTER (WHERE b.id IS NOT NULL), '{}') AS batch_names
       FROM auth.users u
       LEFT JOIN exam.attempts a ON a.examinee_id = u.id
       LEFT JOIN exam.batches  b ON b.id = a.batch_id
      WHERE u.email IS NOT NULL AND u.is_active
      GROUP BY u.id
      ORDER BY u.full_name
      LIMIT 500`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.full_name,
    email: r.email,
    externalId: r.external_id,
    batchNames: r.batch_names,
  }));
}
