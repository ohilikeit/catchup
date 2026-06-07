import 'server-only';
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
