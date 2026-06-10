import 'server-only';
import type { PoolClient } from 'pg';
import { query, queryOne } from '../pool';

// problems / problem_versions repository. 불변 버전 스냅샷(재현·공정성, docs/1 §3).
// 근거: reference/02 §11(불변 FK), organizations.ts 패턴.

export type RoleTrack = 'planning' | 'dev' | 'marketing';

export interface Problem {
  code: string;
  roleTrack: RoleTrack;
  title: string;
  isActive: boolean;
  createdAt: Date;
}

interface ProblemRow {
  code: string;
  role_track: RoleTrack;
  title: string;
  is_active: boolean;
  created_at: Date;
}

function mapProblem(r: ProblemRow): Problem {
  return { code: r.code, roleTrack: r.role_track, title: r.title, isActive: r.is_active, createdAt: r.created_at };
}

/** 문제 + 버전 개수(최신 버전 번호). admin/problems 목록. N+1 회피 위해 집계 조인. */
export interface ProblemWithVersions extends Problem {
  versionCount: number;
  latestVersion: number | null;
}

export async function listProblemsWithVersions(): Promise<ProblemWithVersions[]> {
  const rows = await query<ProblemRow & { version_count: string; latest_version: number | null }>(
    `SELECT p.*,
            COUNT(v.id)     AS version_count,
            MAX(v.version)  AS latest_version
       FROM exam.problems p
       LEFT JOIN exam.problem_versions v ON v.problem_code = p.code
      GROUP BY p.code
      ORDER BY p.created_at DESC`,
  );
  return rows.map((r) => ({
    ...mapProblem(r),
    versionCount: Number(r.version_count),
    latestVersion: r.latest_version,
  }));
}

export interface ProblemVersion {
  id: string;
  problemCode: string;
  version: number;
  publicScaffoldRef: string;
  scaffoldSha256: string;
  publishedAt: Date;
}

interface ProblemVersionRow {
  id: string;
  problem_code: string;
  version: number;
  public_scaffold_ref: string;
  scaffold_sha256: string;
  published_at: Date;
}

function mapVersion(r: ProblemVersionRow): ProblemVersion {
  return {
    id: r.id,
    problemCode: r.problem_code,
    version: r.version,
    publicScaffoldRef: r.public_scaffold_ref,
    scaffoldSha256: r.scaffold_sha256,
    publishedAt: r.published_at,
  };
}

export async function findVersionById(id: string): Promise<ProblemVersion | null> {
  const row = await queryOne<ProblemVersionRow>('SELECT * FROM exam.problem_versions WHERE id = $1', [id]);
  return row ? mapVersion(row) : null;
}

/** 문제 단건(코드 PK). admin 상세 페이지용. */
export async function findProblemByCode(code: string): Promise<Problem | null> {
  const row = await queryOne<ProblemRow>('SELECT * FROM exam.problems WHERE code = $1', [code]);
  return row ? mapProblem(row) : null;
}

/**
 * 스캐폴드 교체(덮어쓰기): ref·sha256 갱신. ⚠️ 버전 불변 원칙(0003)의 예외 —
 * 업로드 실수 교정 운영 도구로만, 호출부(problemService.overwriteScaffold)가 책임진다.
 */
export async function updateVersionScaffold(id: string, ref: string, sha256: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `UPDATE exam.problem_versions SET public_scaffold_ref=$2, scaffold_sha256=$3 WHERE id=$1 RETURNING id`,
    [id, ref, sha256],
  );
  return !!row;
}

/** 문제의 버전 전체(최신순). admin 상세 페이지의 버전 선택용. */
export async function listVersionsByCode(code: string): Promise<ProblemVersion[]> {
  const rows = await query<ProblemVersionRow>(
    'SELECT * FROM exam.problem_versions WHERE problem_code = $1 ORDER BY version DESC',
    [code],
  );
  return rows.map(mapVersion);
}

/* ── 트랜잭션(문제 업로드: upsert 문제 → 다음 버전 → 버전 INSERT) ──────── */

/** 문제 upsert(코드 PK). 같은 코드면 제목/직무만 갱신. RETURNING code. */
export async function upsertProblemTx(
  client: PoolClient,
  code: string,
  roleTrack: RoleTrack,
  title: string,
): Promise<string> {
  const res = await client.query<{ code: string }>(
    `INSERT INTO exam.problems (code, role_track, title)
     VALUES ($1, $2, $3)
     ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title, role_track = EXCLUDED.role_track
     RETURNING code`,
    [code, roleTrack, title],
  );
  return res.rows[0]!.code;
}

/** 다음 버전 번호(현재 최대 + 1, 없으면 1). 같은 트랜잭션 내에서 호출. */
export async function nextVersionTx(client: PoolClient, code: string): Promise<number> {
  const res = await client.query<{ v: number }>(
    `SELECT COALESCE(MAX(version), 0) + 1 AS v FROM exam.problem_versions WHERE problem_code = $1`,
    [code],
  );
  return Number(res.rows[0]!.v);
}

/** 버전 스냅샷 INSERT(불변). scaffold ref/해시 기록 — hidden은 DB에 두지 않는다(서버 전용). */
export async function insertProblemVersionTx(
  client: PoolClient,
  input: { problemCode: string; version: number; publicScaffoldRef: string; scaffoldSha256: string },
): Promise<{ id: string; version: number }> {
  const res = await client.query<{ id: string; version: number }>(
    `INSERT INTO exam.problem_versions (problem_code, version, public_scaffold_ref, scaffold_sha256)
     VALUES ($1, $2, $3, $4)
     RETURNING id, version`,
    [input.problemCode, input.version, input.publicScaffoldRef, input.scaffoldSha256],
  );
  return { id: res.rows[0]!.id, version: res.rows[0]!.version };
}

/** 회차 개설 폼의 problem_version 선택지(문제 제목 + 버전). */
export interface VersionOption {
  versionId: string;
  problemCode: string;
  problemTitle: string;
  version: number;
}

export async function listVersionOptions(): Promise<VersionOption[]> {
  const rows = await query<{ version_id: string; problem_code: string; problem_title: string; version: number }>(
    `SELECT v.id AS version_id, v.problem_code, p.title AS problem_title, v.version
       FROM exam.problem_versions v
       JOIN exam.problems p ON p.code = v.problem_code AND p.is_active
      ORDER BY p.title, v.version DESC`,
  );
  return rows.map((r) => ({
    versionId: r.version_id,
    problemCode: r.problem_code,
    problemTitle: r.problem_title,
    version: r.version,
  }));
}
