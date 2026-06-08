import 'server-only';
import { query, queryOne } from '../pool';

// batches repository — 회차(=동시 50명 한 창). 전달방식은 hosted 단일(docs/1 §5).
// 목록 쿼리는 org/problem 조인 + attempt/submission 집계로 N+1을 피한다(reference/09).

export type BatchStatus = 'scheduled' | 'open' | 'closed';

export interface Batch {
  id: string;
  orgId: string;
  name: string;
  problemVersionId: string;
  capacity: number;
  status: BatchStatus;
  scheduledAt: Date | null;
  openedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface BatchRow {
  id: string;
  org_id: string;
  name: string;
  problem_version_id: string;
  capacity: number;
  status: BatchStatus;
  scheduled_at: Date | null;
  opened_at: Date | null;
  closed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapRow(r: BatchRow): Batch {
  return {
    id: r.id,
    orgId: r.org_id,
    name: r.name,
    problemVersionId: r.problem_version_id,
    capacity: r.capacity,
    status: r.status,
    scheduledAt: r.scheduled_at,
    openedAt: r.opened_at,
    closedAt: r.closed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** 목록 행(조인된 표시용 메타 포함). */
export interface BatchListItem {
  id: string;
  name: string;
  orgId: string;
  orgName: string;
  problemTitle: string;
  problemVersion: number;
  capacity: number;
  status: BatchStatus;
  scheduledAt: Date | null;
  attemptCount: number;
  submittedCount: number;
  acceptedCount: number;
}

interface BatchListRow extends BatchRow {
  org_name: string;
  problem_title: string;
  problem_version: number;
  attempt_count: string;
  submitted_count: string;
  accepted_count: string;
}

const LIST_SELECT = `
  SELECT b.*,
         o.name  AS org_name,
         p.title AS problem_title,
         v.version AS problem_version,
         COUNT(DISTINCT a.id) AS attempt_count,
         COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'submitted') AS submitted_count,
         COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'accepted')  AS accepted_count
    FROM exam.batches b
    JOIN auth.organizations o ON o.id = b.org_id
    JOIN exam.problem_versions v ON v.id = b.problem_version_id
    JOIN exam.problems p ON p.code = v.problem_code
    LEFT JOIN exam.attempts a ON a.batch_id = b.id
    LEFT JOIN exam.submissions s ON s.attempt_id = a.id
`;

function mapListRow(r: BatchListRow): BatchListItem {
  return {
    id: r.id,
    name: r.name,
    orgId: r.org_id,
    orgName: r.org_name,
    problemTitle: r.problem_title,
    problemVersion: r.problem_version,
    capacity: r.capacity,
    status: r.status,
    scheduledAt: r.scheduled_at,
    attemptCount: Number(r.attempt_count),
    submittedCount: Number(r.submitted_count),
    acceptedCount: Number(r.accepted_count),
  };
}

/** admin: 전체 회차. */
export async function listAll(opts: { limit?: number; offset?: number } = {}): Promise<BatchListItem[]> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;
  const rows = await query<BatchListRow>(
    `${LIST_SELECT} GROUP BY b.id, o.name, p.title, v.version
      ORDER BY b.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return rows.map(mapListRow);
}

/**
 * org_admin: 자기 대학 회차만. ⭐ org 스코프 강제 — org_id = ANY($1).
 * 빈 배열이면 아무것도 안 보이게(누수 방지).
 */
export async function listByOrgIds(orgIds: string[], opts: { limit?: number; offset?: number } = {}): Promise<BatchListItem[]> {
  if (orgIds.length === 0) return [];
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;
  const rows = await query<BatchListRow>(
    `${LIST_SELECT} WHERE b.org_id = ANY($1::uuid[])
      GROUP BY b.id, o.name, p.title, v.version
      ORDER BY b.created_at DESC LIMIT $2 OFFSET $3`,
    [orgIds, limit, offset],
  );
  return rows.map(mapListRow);
}

export async function findById(id: string): Promise<Batch | null> {
  const row = await queryOne<BatchRow>('SELECT * FROM exam.batches WHERE id = $1', [id]);
  return row ? mapRow(row) : null;
}

/** 회차 상세(목록 행과 동일한 조인+집계, 단건). 없으면 null. */
export async function findDetailById(id: string): Promise<BatchListItem | null> {
  const rows = await query<BatchListRow>(
    `${LIST_SELECT} WHERE b.id = $1 GROUP BY b.id, o.name, p.title, v.version`,
    [id],
  );
  return rows[0] ? mapListRow(rows[0]) : null;
}

export async function create(input: {
  orgId: string;
  name: string;
  problemVersionId: string;
  capacity?: number;
  scheduledAt?: Date | null;
}): Promise<Batch> {
  const row = await queryOne<BatchRow>(
    `INSERT INTO exam.batches (org_id, name, problem_version_id, capacity, scheduled_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      input.orgId,
      input.name,
      input.problemVersionId,
      input.capacity ?? 50,
      input.scheduledAt ?? null,
    ],
  );
  return mapRow(row!);
}

export async function setStatus(id: string, status: BatchStatus): Promise<Batch | null> {
  // open/closed 전이 시 타임스탬프도 같이(서버가 시각의 단일 근거).
  const col = status === 'open' ? 'opened_at' : status === 'closed' ? 'closed_at' : null;
  const sql = col
    ? `UPDATE exam.batches SET status = $1, ${col} = NOW() WHERE id = $2 RETURNING *`
    : `UPDATE exam.batches SET status = $1 WHERE id = $2 RETURNING *`;
  const row = await queryOne<BatchRow>(sql, [status, id]);
  return row ? mapRow(row) : null;
}
