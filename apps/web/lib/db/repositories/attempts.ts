import 'server-only';
import type { PoolClient } from 'pg';
import { query, queryOne } from '../pool';

// attempts repository — 응시. ⭐ 평가상태 없음(grading 모듈 소관, docs/1 §3).
// 전달방식은 hosted 단일. deadline_at은 서버강제 마감의 근거.

export type AttemptStatus = 'ready' | 'running' | 'submitted' | 'expired' | 'void';

export interface Attempt {
  id: string;
  batchId: string;
  examineeId: string;
  status: AttemptStatus;
  startsAt: Date | null;
  deadlineAt: Date | null;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AttemptRow {
  id: string;
  batch_id: string;
  examinee_id: string;
  status: AttemptStatus;
  starts_at: Date | null;
  deadline_at: Date | null;
  submitted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapRow(r: AttemptRow): Attempt {
  return {
    id: r.id,
    batchId: r.batch_id,
    examineeId: r.examinee_id,
    status: r.status,
    startsAt: r.starts_at,
    deadlineAt: r.deadline_at,
    submittedAt: r.submitted_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function findById(id: string): Promise<Attempt | null> {
  const row = await queryOne<AttemptRow>('SELECT * FROM exam.attempts WHERE id = $1', [id]);
  return row ? mapRow(row) : null;
}

/** my/exams: 내 응시 목록 + 회차/대학/문제/제출상태(조인). */
export interface MyExamItem {
  attemptId: string;
  batchName: string;
  orgName: string;
  problemTitle: string;
  status: AttemptStatus;
  startsAt: Date | null;
  deadlineAt: Date | null;
  submissionStatus: string | null;
}

export async function listByExaminee(examineeId: string): Promise<MyExamItem[]> {
  const rows = await query<{
    attempt_id: string;
    batch_name: string;
    org_name: string;
    problem_title: string;
    status: AttemptStatus;
    starts_at: Date | null;
    deadline_at: Date | null;
    submission_status: string | null;
  }>(
    `SELECT a.id AS attempt_id, b.name AS batch_name, o.name AS org_name,
            p.title AS problem_title, a.status,
            a.starts_at, a.deadline_at, s.status AS submission_status
       FROM exam.attempts a
       JOIN exam.batches b ON b.id = a.batch_id
       JOIN auth.organizations o ON o.id = b.org_id
       JOIN exam.problem_versions v ON v.id = b.problem_version_id
       JOIN exam.problems p ON p.code = v.problem_code
       LEFT JOIN exam.submissions s ON s.attempt_id = a.id
      WHERE a.examinee_id = $1
      ORDER BY a.created_at DESC`,
    [examineeId],
  );
  return rows.map((r) => ({
    attemptId: r.attempt_id,
    batchName: r.batch_name,
    orgName: r.org_name,
    problemTitle: r.problem_title,
    status: r.status,
    startsAt: r.starts_at,
    deadlineAt: r.deadline_at,
    submissionStatus: r.submission_status,
  }));
}

/** 시험 런타임 진입: 소유권 확인 + scaffold/마감 등 진행에 필요한 메타(조인). */
export interface AttemptRuntime {
  attemptId: string;
  examineeId: string;
  status: AttemptStatus;
  startsAt: Date | null;
  deadlineAt: Date | null;
  batchName: string;
  batchStatus: string;
  problemTitle: string;
  publicScaffoldRef: string;
  scaffoldSha256: string;
}

export async function findRuntimeForExaminee(
  attemptId: string,
  examineeId: string,
): Promise<AttemptRuntime | null> {
  const r = await queryOne<{
    attempt_id: string;
    examinee_id: string;
    status: AttemptStatus;
    starts_at: Date | null;
    deadline_at: Date | null;
    batch_name: string;
    batch_status: string;
    problem_title: string;
    public_scaffold_ref: string;
    scaffold_sha256: string;
  }>(
    `SELECT a.id AS attempt_id, a.examinee_id, a.status,
            a.starts_at, a.deadline_at,
            b.name AS batch_name, b.status AS batch_status,
            p.title AS problem_title,
            v.public_scaffold_ref, v.scaffold_sha256
       FROM exam.attempts a
       JOIN exam.batches b ON b.id = a.batch_id
       JOIN exam.problem_versions v ON v.id = b.problem_version_id
       JOIN exam.problems p ON p.code = v.problem_code
      WHERE a.id = $1 AND a.examinee_id = $2`,
    [attemptId, examineeId],
  );
  if (!r) return null;
  return {
    attemptId: r.attempt_id,
    examineeId: r.examinee_id,
    status: r.status,
    startsAt: r.starts_at,
    deadlineAt: r.deadline_at,
    batchName: r.batch_name,
    batchStatus: r.batch_status,
    problemTitle: r.problem_title,
    publicScaffoldRef: r.public_scaffold_ref,
    scaffoldSha256: r.scaffold_sha256,
  };
}

/** 회차 로스터 현황(admin/org batch 상세). attempt + examinee + 제출상태. */
export interface RosterItem {
  attemptId: string;
  examineeId: string;
  examineeName: string;
  status: AttemptStatus;
  submissionStatus: string | null;
  submittedAt: Date | null;
}

export async function listRosterByBatch(batchId: string): Promise<RosterItem[]> {
  const rows = await query<{
    attempt_id: string;
    examinee_id: string;
    examinee_name: string;
    status: AttemptStatus;
    submission_status: string | null;
    submitted_at: Date | null;
  }>(
    `SELECT a.id AS attempt_id, a.examinee_id, u.full_name AS examinee_name,
            a.status, s.status AS submission_status, a.submitted_at
       FROM exam.attempts a
       JOIN auth.users u ON u.id = a.examinee_id
       LEFT JOIN exam.submissions s ON s.attempt_id = a.id
      WHERE a.batch_id = $1
      ORDER BY u.full_name`,
    [batchId],
  );
  return rows.map((r) => ({
    attemptId: r.attempt_id,
    examineeId: r.examinee_id,
    examineeName: r.examinee_name,
    status: r.status,
    submissionStatus: r.submission_status,
    submittedAt: r.submitted_at,
  }));
}

/** 응시 상세(회차·대학·문제·제출·응시자 조인). 운영/리포트/학생상세 공용. */
export interface AttemptDetail {
  attemptId: string;
  examineeId: string;
  examineeName: string;
  examineeEmail: string | null;
  batchId: string;
  batchName: string;
  orgId: string;
  orgName: string;
  problemTitle: string;
  status: AttemptStatus;
  startsAt: Date | null;
  deadlineAt: Date | null;
  submittedAt: Date | null;
  submissionId: string | null;
  submissionStatus: string | null;
  submissionTrust: string | null;
}

export async function findDetailById(attemptId: string): Promise<AttemptDetail | null> {
  const r = await queryOne<{
    attempt_id: string;
    examinee_id: string;
    examinee_name: string;
    examinee_email: string | null;
    batch_id: string;
    batch_name: string;
    org_id: string;
    org_name: string;
    problem_title: string;
    status: AttemptStatus;
    starts_at: Date | null;
    deadline_at: Date | null;
    submitted_at: Date | null;
    submission_id: string | null;
    submission_status: string | null;
    submission_trust: string | null;
  }>(
    `SELECT a.id AS attempt_id, a.examinee_id, u.full_name AS examinee_name, u.email AS examinee_email,
            b.id AS batch_id, b.name AS batch_name, o.id AS org_id, o.name AS org_name,
            p.title AS problem_title, a.status,
            a.starts_at, a.deadline_at, a.submitted_at,
            s.id AS submission_id, s.status AS submission_status, s.trust AS submission_trust
       FROM exam.attempts a
       JOIN exam.batches b ON b.id = a.batch_id
       JOIN auth.organizations o ON o.id = b.org_id
       JOIN exam.problem_versions v ON v.id = b.problem_version_id
       JOIN exam.problems p ON p.code = v.problem_code
       JOIN auth.users u ON u.id = a.examinee_id
       LEFT JOIN exam.submissions s ON s.attempt_id = a.id
      WHERE a.id = $1`,
    [attemptId],
  );
  if (!r) return null;
  return {
    attemptId: r.attempt_id,
    examineeId: r.examinee_id,
    examineeName: r.examinee_name,
    examineeEmail: r.examinee_email,
    batchId: r.batch_id,
    batchName: r.batch_name,
    orgId: r.org_id,
    orgName: r.org_name,
    problemTitle: r.problem_title,
    status: r.status,
    startsAt: r.starts_at,
    deadlineAt: r.deadline_at,
    submittedAt: r.submitted_at,
    submissionId: r.submission_id,
    submissionStatus: r.submission_status,
    submissionTrust: r.submission_trust,
  };
}

/** 감사 이벤트 타임라인(최신순). attempt_events append-only. */
export interface AttemptEvent {
  id: string;
  type: string;
  detail: Record<string, unknown>;
  createdAt: Date;
}

export async function listEvents(attemptId: string): Promise<AttemptEvent[]> {
  const rows = await query<{ id: string; type: string; detail: Record<string, unknown>; created_at: Date }>(
    `SELECT id, type, detail, created_at FROM exam.attempt_events
      WHERE attempt_id = $1 ORDER BY created_at DESC, id DESC`,
    [attemptId],
  );
  return rows.map((r) => ({ id: String(r.id), type: r.type, detail: r.detail ?? {}, createdAt: r.created_at }));
}

/** 응시 시작: ready → running, starts_at/deadline_at 설정(서버가 시각 결정). */
export async function startAttempt(id: string, deadlineAt: Date): Promise<Attempt | null> {
  const row = await queryOne<AttemptRow>(
    `UPDATE exam.attempts
        SET status = 'running', starts_at = COALESCE(starts_at, NOW()), deadline_at = $2
      WHERE id = $1 AND status IN ('ready','running')
      RETURNING *`,
    [id, deadlineAt],
  );
  return row ? mapRow(row) : null;
}

/* ── 트랜잭션(제출 시 deadline 재판정과 원자적) ────────────────────────── */

/** 행을 잠그고(FOR UPDATE) 현재 상태/마감을 읽는다. 동시 제출·만료 경합 차단. */
export async function lockForSubmitTx(client: PoolClient, attemptId: string): Promise<Attempt | null> {
  const res = await client.query<AttemptRow>(
    'SELECT * FROM exam.attempts WHERE id = $1 FOR UPDATE',
    [attemptId],
  );
  return res.rows[0] ? mapRow(res.rows[0]) : null;
}

/** 제출 확정: → submitted, submitted_at=NOW(). */
export async function markSubmittedTx(client: PoolClient, attemptId: string): Promise<void> {
  await client.query(
    `UPDATE exam.attempts SET status = 'submitted', submitted_at = NOW() WHERE id = $1`,
    [attemptId],
  );
}

/** 마감 초과 시 만료 처리(이벤트로도 기록되지만 상태도 박는다). */
export async function markExpiredTx(client: PoolClient, attemptId: string): Promise<void> {
  await client.query(
    `UPDATE exam.attempts SET status = 'expired' WHERE id = $1 AND status <> 'submitted'`,
    [attemptId],
  );
}

/** 로스터 import: 회차에 응시 멱등 생성(uq_attempt로 중복 차단). 반환: 생성여부. */
export async function ensureAttemptTx(
  client: PoolClient,
  input: { batchId: string; examineeId: string },
): Promise<boolean> {
  const res = await client.query(
    `INSERT INTO exam.attempts (batch_id, examinee_id)
     VALUES ($1, $2)
     ON CONFLICT (batch_id, examinee_id) DO NOTHING`,
    [input.batchId, input.examineeId],
  );
  return (res.rowCount ?? 0) > 0;
}

/** 감사 이벤트(append-only). 트랜잭션 안에서 기록. */
export async function addEventTx(
  client: PoolClient,
  attemptId: string,
  type: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await client.query(
    `INSERT INTO exam.attempt_events (attempt_id, type, detail) VALUES ($1, $2, $3)`,
    [attemptId, type, JSON.stringify(detail)],
  );
}

/** 운영: 마감 연장(제출/만료/무효가 아닌 경우만). 반환: 갱신 성공 여부. */
export async function extendDeadlineTx(client: PoolClient, attemptId: string, deadlineAt: Date): Promise<boolean> {
  const res = await client.query(
    `UPDATE exam.attempts SET deadline_at = $2
      WHERE id = $1 AND status IN ('ready','running')`,
    [attemptId, deadlineAt],
  );
  return (res.rowCount ?? 0) > 0;
}

/** 운영: 응시 무효 처리(제출 완료가 아닌 경우만). 반환: 성공 여부. */
export async function voidAttemptTx(client: PoolClient, attemptId: string): Promise<boolean> {
  const res = await client.query(
    `UPDATE exam.attempts SET status = 'void' WHERE id = $1 AND status <> 'submitted'`,
    [attemptId],
  );
  return (res.rowCount ?? 0) > 0;
}
