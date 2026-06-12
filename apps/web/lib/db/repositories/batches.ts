import 'server-only';
import type { PoolClient } from 'pg';
import { query, queryOne, getPool } from '../pool';

// batches repository — 회차(=동시 50명 한 창). 전달방식은 hosted 단일(docs/1 §5).
// 목록 쿼리는 org/problem 조인 + attempt/submission 집계로 N+1을 피한다(reference/09).

export type BatchStatus = 'scheduled' | 'open' | 'closed' | 'cancelled';

export interface Batch {
  id: string;
  orgId: string;
  name: string;
  problemVersionId: string;
  capacity: number;
  status: BatchStatus;
  scheduledAt: Date | null;
  /** 회차 1인당 LLM 예산 상한(USD). 가상키 max_budget의 근거. NULL=상한 없음(0010). */
  llmBudgetUsd: number | null;
  /** 미리(상시) 띄워둘 워밍 pod 수. NULL=capacity(일괄). 작으면 라이브 입장(0013, docs/6 Phase 3). */
  warmCount: number | null;
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
  llm_budget_usd: string | null; // NUMERIC → pg는 문자열로 반환
  warm_count: number | null;
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
    llmBudgetUsd: r.llm_budget_usd == null ? null : Number(r.llm_budget_usd),
    warmCount: r.warm_count,
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
  llmBudgetUsd: number | null;
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
    llmBudgetUsd: r.llm_budget_usd == null ? null : Number(r.llm_budget_usd),
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
  llmBudgetUsd?: number | null;
  warmCount?: number | null;
}): Promise<Batch> {
  const row = await queryOne<BatchRow>(
    `INSERT INTO exam.batches (org_id, name, problem_version_id, capacity, scheduled_at, llm_budget_usd, warm_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      input.orgId,
      input.name,
      input.problemVersionId,
      input.capacity ?? 50,
      input.scheduledAt ?? null,
      input.llmBudgetUsd ?? null,
      input.warmCount ?? null,
    ],
  );
  return mapRow(row!);
}

/**
 * 트랜잭션 내 회차 상태를 행 잠금(FOR UPDATE)으로 읽는다 — start↔close 직렬화용.
 * 시작 트랜잭션이 이 행을 먼저 잠그면 close 의 setStatus(UPDATE)는 커밋까지 대기하고,
 * close 가 먼저면 여기서 잠긴 행은 'closed' 로 보여 시작이 거부된다(닫힌 회차에 running 응시 방지).
 * 없는 회차면 null.
 */
export async function lockStatusTx(client: PoolClient, id: string): Promise<BatchStatus | null> {
  const res = await client.query<{ status: BatchStatus }>(
    `SELECT status FROM exam.batches WHERE id = $1 FOR UPDATE`,
    [id],
  );
  return res.rows[0]?.status ?? null;
}

export async function setStatus(id: string, status: BatchStatus): Promise<Batch | null> {
  // open 전이는 opened_at, closed/cancelled(종단)는 closed_at 을 찍는다(서버가 시각의 단일 근거).
  const col = status === 'open' ? 'opened_at' : status === 'closed' || status === 'cancelled' ? 'closed_at' : null;
  const sql = col
    ? `UPDATE exam.batches SET status = $1, ${col} = NOW() WHERE id = $2 RETURNING *`
    : `UPDATE exam.batches SET status = $1 WHERE id = $2 RETURNING *`;
  const row = await queryOne<BatchRow>(sql, [status, id]);
  return row ? mapRow(row) : null;
}

/**
 * 회차 하드 삭제. slots·roster_imports·entry_queue 는 ON DELETE CASCADE 로 함께 삭제.
 * ⚠️ attempts.batch_id 는 ON DELETE RESTRICT — 응시가 1건이라도 있으면 DB가 거부(throw).
 *    그래서 service 가 "scheduled + 응시 0" 을 선판정한 뒤에만 호출한다(이력 보존 불변식).
 * 반환: 삭제된 행 수(1=성공, 0=이미 없음).
 */
export async function deleteBatch(id: string): Promise<number> {
  const res = await getPool().query(`DELETE FROM exam.batches WHERE id = $1`, [id]);
  return res.rowCount ?? 0;
}
