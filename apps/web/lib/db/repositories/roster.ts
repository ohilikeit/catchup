import 'server-only';
import type { PoolClient } from 'pg';
import { query, queryOne } from '../pool';

// ops.roster_* repository — 로스터 CSV import 추적(재실행 가능·멱등, docs/1 §4).
// import 단위로 추적해 부분 실패·재실행을 안전하게. 행 단위 결과까지 보존.

export type ImportStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface RosterImport {
  id: string;
  batchId: string;
  status: ImportStatus;
  summary: { created?: number; skipped?: number; errors?: number };
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface RosterImportRow {
  id: string;
  batch_id: string;
  status: ImportStatus;
  summary: RosterImport['summary'];
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

function mapImport(r: RosterImportRow): RosterImport {
  return {
    id: r.id,
    batchId: r.batch_id,
    status: r.status,
    summary: r.summary ?? {},
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listImportsByBatch(batchId: string): Promise<RosterImport[]> {
  const rows = await query<RosterImportRow>(
    'SELECT * FROM ops.roster_imports WHERE batch_id = $1 ORDER BY created_at DESC',
    [batchId],
  );
  return rows.map(mapImport);
}

export async function findImportById(id: string): Promise<RosterImport | null> {
  const row = await queryOne<RosterImportRow>('SELECT * FROM ops.roster_imports WHERE id = $1', [id]);
  return row ? mapImport(row) : null;
}

/* ── 트랜잭션(import는 전부-또는-전무로 멱등 생성) ────────────────────── */

export async function createImportTx(
  client: PoolClient,
  batchId: string,
  createdBy: string | null,
): Promise<string> {
  const res = await client.query<{ id: string }>(
    `INSERT INTO ops.roster_imports (batch_id, status, created_by)
     VALUES ($1, 'processing', $2) RETURNING id`,
    [batchId, createdBy],
  );
  return res.rows[0]!.id;
}

export async function addImportRowTx(
  client: PoolClient,
  importId: string,
  raw: Record<string, unknown>,
  result: 'created' | 'skipped' | 'error',
  error: string | null,
): Promise<void> {
  await client.query(
    `INSERT INTO ops.roster_import_rows (import_id, raw, result, error)
     VALUES ($1, $2, $3, $4)`,
    [importId, JSON.stringify(raw), result, error],
  );
}

export async function finishImportTx(
  client: PoolClient,
  importId: string,
  status: ImportStatus,
  summary: RosterImport['summary'],
): Promise<void> {
  await client.query(
    `UPDATE ops.roster_imports SET status = $2, summary = $3 WHERE id = $1`,
    [importId, status, JSON.stringify(summary)],
  );
}
