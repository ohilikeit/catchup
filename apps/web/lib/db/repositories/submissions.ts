import 'server-only';
import type { PoolClient } from 'pg';
import { query, queryOne } from '../pool';

// submissions repository — ⭐ 뼈대의 최종 산출물 = 평가 모듈의 단일 입구(docs/1 §3·§5).
// 'accepted'만 평가 대상. trust는 서버가 어댑터 신원으로만 산출(클라 설정 불가).
//
// 제출 적재는 deadline 재판정과 한 트랜잭션이어야 하므로 *Tx 함수는 PoolClient를 받는다
// (SQL은 repository에만 둔다는 규칙을 지키면서 service가 트랜잭션을 조립).

export type SubmissionStatus = 'received' | 'validating' | 'accepted' | 'rejected';
export type CapturedVia = 'proxy' | 'upload';
export type Trust = 'verified' | 'unverified';

export interface Submission {
  id: string;
  attemptId: string;
  status: SubmissionStatus;
  tool: string | null;
  chatFormatVersion: number;
  capturedVia: CapturedVia;
  trust: Trust;
  validationError: string | null;
  acceptedAt: Date | null;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface SubmissionRow {
  id: string;
  attempt_id: string;
  status: SubmissionStatus;
  tool: string | null;
  chat_format_version: number;
  captured_via: CapturedVia;
  trust: Trust;
  validation_error: string | null;
  accepted_at: Date | null;
  submitted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapRow(r: SubmissionRow): Submission {
  return {
    id: r.id,
    attemptId: r.attempt_id,
    status: r.status,
    tool: r.tool,
    chatFormatVersion: r.chat_format_version,
    capturedVia: r.captured_via,
    trust: r.trust,
    validationError: r.validation_error,
    acceptedAt: r.accepted_at,
    submittedAt: r.submitted_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function findByAttempt(attemptId: string): Promise<Submission | null> {
  const row = await queryOne<SubmissionRow>('SELECT * FROM exam.submissions WHERE attempt_id = $1', [attemptId]);
  return row ? mapRow(row) : null;
}

/** 제출 상세(응시·회차·대학·응시자 조인). admin 제출 검증 상세. */
export interface SubmissionDetail {
  id: string;
  attemptId: string;
  status: SubmissionStatus;
  trust: Trust;
  capturedVia: CapturedVia;
  tool: string | null;
  chatFormatVersion: number;
  validationError: string | null;
  submittedAt: Date | null;
  acceptedAt: Date | null;
  examineeName: string;
  examineeEmail: string | null;
  orgId: string;
  orgName: string;
  batchId: string;
  batchName: string;
}

export async function findDetailById(id: string): Promise<SubmissionDetail | null> {
  const r = await queryOne<SubmissionRow & {
    examinee_name: string;
    examinee_email: string | null;
    org_id: string;
    org_name: string;
    batch_id: string;
    batch_name: string;
  }>(
    `SELECT s.*, u.full_name AS examinee_name, u.email AS examinee_email,
            o.id AS org_id, o.name AS org_name, b.id AS batch_id, b.name AS batch_name
       FROM exam.submissions s
       JOIN exam.attempts a ON a.id = s.attempt_id
       JOIN exam.batches b ON b.id = a.batch_id
       JOIN auth.organizations o ON o.id = b.org_id
       JOIN auth.users u ON u.id = a.examinee_id
      WHERE s.id = $1`,
    [id],
  );
  if (!r) return null;
  return {
    id: r.id,
    attemptId: r.attempt_id,
    status: r.status,
    trust: r.trust,
    capturedVia: r.captured_via,
    tool: r.tool,
    chatFormatVersion: r.chat_format_version,
    validationError: r.validation_error,
    submittedAt: r.submitted_at,
    acceptedAt: r.accepted_at,
    examineeName: r.examinee_name,
    examineeEmail: r.examinee_email,
    orgId: r.org_id,
    orgName: r.org_name,
    batchId: r.batch_id,
    batchName: r.batch_name,
  };
}

export interface SubmissionFile {
  id: string;
  kind: 'chat_log' | 'artifact';
  ref: string;
  sha256: string;
  sizeBytes: number;
  mime: string | null;
  createdAt: Date;
}

export async function listFiles(submissionId: string): Promise<SubmissionFile[]> {
  const rows = await query<{
    id: string;
    kind: 'chat_log' | 'artifact';
    ref: string;
    sha256: string;
    size_bytes: string;
    mime: string | null;
    created_at: Date;
  }>(
    `SELECT id, kind, ref, sha256, size_bytes, mime, created_at
       FROM exam.submission_files WHERE submission_id = $1 ORDER BY kind, created_at`,
    [submissionId],
  );
  return rows.map((r) => ({
    id: String(r.id),
    kind: r.kind,
    ref: r.ref,
    sha256: r.sha256,
    sizeBytes: Number(r.size_bytes),
    mime: r.mime,
    createdAt: r.created_at,
  }));
}

/** 제출 검증 현황(admin/submissions, org dashboard). 조인 + 파일수 집계. org 스코프 옵션. */
export interface SubmissionListItem {
  id: string;
  attemptId: string;
  status: SubmissionStatus;
  trust: Trust;
  capturedVia: CapturedVia;
  tool: string | null;
  examineeName: string;
  orgId: string;
  orgName: string;
  batchName: string;
  fileCount: number;
  submittedAt: Date | null;
}

interface SubmissionListRow {
  id: string;
  attempt_id: string;
  status: SubmissionStatus;
  trust: Trust;
  captured_via: CapturedVia;
  tool: string | null;
  examinee_name: string;
  org_id: string;
  org_name: string;
  batch_name: string;
  file_count: string;
  submitted_at: Date | null;
}

const LIST_SELECT = `
  SELECT s.id, s.attempt_id, s.status, s.trust, s.captured_via, s.tool,
         u.full_name AS examinee_name, o.id AS org_id, o.name AS org_name,
         b.name AS batch_name, COUNT(f.id) AS file_count, s.submitted_at
    FROM exam.submissions s
    JOIN exam.attempts a ON a.id = s.attempt_id
    JOIN exam.batches b ON b.id = a.batch_id
    JOIN auth.organizations o ON o.id = b.org_id
    JOIN auth.users u ON u.id = a.examinee_id
    LEFT JOIN exam.submission_files f ON f.submission_id = s.id
`;

function mapListRow(r: SubmissionListRow): SubmissionListItem {
  return {
    id: r.id,
    attemptId: r.attempt_id,
    status: r.status,
    trust: r.trust,
    capturedVia: r.captured_via,
    tool: r.tool,
    examineeName: r.examinee_name,
    orgId: r.org_id,
    orgName: r.org_name,
    batchName: r.batch_name,
    fileCount: Number(r.file_count),
    submittedAt: r.submitted_at,
  };
}

export async function listAll(opts: { limit?: number; offset?: number } = {}): Promise<SubmissionListItem[]> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;
  const rows = await query<SubmissionListRow>(
    `${LIST_SELECT} GROUP BY s.id, u.full_name, o.id, o.name, b.name
      ORDER BY s.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return rows.map(mapListRow);
}

/** org_admin: 자기 대학 제출만. ⭐ org 스코프 강제. */
export async function listByOrgIds(orgIds: string[], opts: { limit?: number; offset?: number } = {}): Promise<SubmissionListItem[]> {
  if (orgIds.length === 0) return [];
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;
  const rows = await query<SubmissionListRow>(
    `${LIST_SELECT} WHERE o.id = ANY($1::uuid[])
      GROUP BY s.id, u.full_name, o.id, o.name, b.name
      ORDER BY s.created_at DESC LIMIT $2 OFFSET $3`,
    [orgIds, limit, offset],
  );
  return rows.map(mapListRow);
}

/* ── 트랜잭션 적재(byod 업로드 제출 — deadline 재판정과 원자적) ────────────── */

export interface SubmissionFileInput {
  kind: 'chat_log' | 'artifact';
  ref: string;
  sha256: string;
  sizeBytes: number;
  mime: string | null;
}

/** submission 1건 생성(트랜잭션 client). attempt_id UNIQUE라 재제출 시 충돌 → 호출부가 선처리. */
export async function insertSubmissionTx(
  client: PoolClient,
  input: {
    attemptId: string;
    capturedVia: CapturedVia;
    trust: Trust;
    tool: string | null;
    chatFormatVersion: number;
    status: SubmissionStatus;
  },
): Promise<Submission> {
  const res = await client.query<SubmissionRow>(
    `INSERT INTO exam.submissions
       (attempt_id, captured_via, trust, tool, chat_format_version, status, submitted_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     RETURNING *`,
    [input.attemptId, input.capturedVia, input.trust, input.tool, input.chatFormatVersion, input.status],
  );
  return mapRow(res.rows[0]!);
}

export async function insertFilesTx(
  client: PoolClient,
  submissionId: string,
  files: SubmissionFileInput[],
): Promise<void> {
  for (const f of files) {
    await client.query(
      `INSERT INTO exam.submission_files (submission_id, kind, ref, sha256, size_bytes, mime)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [submissionId, f.kind, f.ref, f.sha256, f.sizeBytes, f.mime],
    );
  }
}

/** 검증 결과 반영: received/validating → accepted | rejected. */
export async function setStatusTx(
  client: PoolClient,
  submissionId: string,
  status: SubmissionStatus,
  validationError: string | null,
): Promise<void> {
  await client.query(
    `UPDATE exam.submissions
        SET status = $2, validation_error = $3,
            accepted_at = CASE WHEN $2 = 'accepted' THEN NOW() ELSE accepted_at END
      WHERE id = $1`,
    [submissionId, status, validationError],
  );
}
