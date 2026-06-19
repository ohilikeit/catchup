import 'server-only';
import type { PoolClient } from 'pg';
import { query, queryOne } from '../pool';
import { DEFAULT_EXCLUDE_PATTERNS } from '../../tracking/excludes';

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
  batchStatus: string;
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
    batch_status: string;
    org_name: string;
    problem_title: string;
    status: AttemptStatus;
    starts_at: Date | null;
    deadline_at: Date | null;
    submission_status: string | null;
  }>(
    `SELECT a.id AS attempt_id, b.name AS batch_name, b.status AS batch_status, o.name AS org_name,
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
    batchStatus: r.batch_status,
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
  batchId: string;
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
    batch_id: string;
    status: AttemptStatus;
    starts_at: Date | null;
    deadline_at: Date | null;
    batch_name: string;
    batch_status: string;
    problem_title: string;
    public_scaffold_ref: string;
    scaffold_sha256: string;
  }>(
    `SELECT a.id AS attempt_id, a.examinee_id, a.batch_id, a.status,
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
    batchId: r.batch_id,
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
  examineeEmail: string | null;
  /** 발급 임시비번 평문(관리자 전달용). 학생이 비번 변경하면 NULL. */
  tempPassword: string | null;
  status: AttemptStatus;
  submissionStatus: string | null;
  submittedAt: Date | null;
}

export async function listRosterByBatch(batchId: string): Promise<RosterItem[]> {
  const rows = await query<{
    attempt_id: string;
    examinee_id: string;
    examinee_name: string;
    examinee_email: string | null;
    temp_password: string | null;
    status: AttemptStatus;
    submission_status: string | null;
    submitted_at: Date | null;
  }>(
    `SELECT a.id AS attempt_id, a.examinee_id, u.full_name AS examinee_name,
            u.email AS examinee_email, u.temp_password,
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
    examineeEmail: r.examinee_email,
    tempPassword: r.temp_password,
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

/** 응시 시작(트랜잭션 버전): ready/running → running. withTransaction 내에서 슬롯 배정과 원자적으로 실행. */
export async function startRunningTx(client: PoolClient, id: string, deadlineAt: Date): Promise<Attempt | null> {
  const res = await client.query<AttemptRow>(
    `UPDATE exam.attempts
        SET status = 'running', starts_at = COALESCE(starts_at, NOW()), deadline_at = $2
      WHERE id = $1 AND status IN ('ready','running')
      RETURNING *`,
    [id, deadlineAt],
  );
  return res.rows[0] ? mapRow(res.rows[0]) : null;
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

/** 운영: 강제 제출(ready/running → submitted). 이미 제출/만료/무효면 갱신 안 함. 반환: 성공 여부.
 * ⚠️ 상태 전이만 — 산출물 패키징(hosted 캡처→MinIO)은 Phase 3 exam-ops 소관(docs/6 Phase 3). */
export async function forceSubmitTx(client: PoolClient, attemptId: string): Promise<boolean> {
  const res = await client.query(
    `UPDATE exam.attempts SET status = 'submitted', submitted_at = NOW()
      WHERE id = $1 AND status IN ('ready','running')`,
    [attemptId],
  );
  return (res.rowCount ?? 0) > 0;
}

/** 마감 초과 시 만료 처리(이벤트로도 기록되지만 상태도 박는다). */
export async function markExpiredTx(client: PoolClient, attemptId: string): Promise<void> {
  await client.query(
    `UPDATE exam.attempts SET status = 'expired' WHERE id = $1 AND status <> 'submitted'`,
    [attemptId],
  );
}

/**
 * 마감 자동 회수 대상: deadline 지난 running 응시(있으면 batch 한정).
 * idx_attempt 인덱스(batch_id,status)를 타며, deadline_at IS NOT NULL 만(아직 시작 안 한 ready 제외).
 * 반환: attemptId 목록(스윕이 각각 강제 마감 + 패키징한다).
 */
export async function listExpiredRunning(batchId?: string): Promise<string[]> {
  const rows = batchId
    ? await query<{ id: string }>(
        `SELECT id FROM exam.attempts
          WHERE status = 'running' AND deadline_at IS NOT NULL AND deadline_at < NOW() AND batch_id = $1`,
        [batchId],
      )
    : await query<{ id: string }>(
        `SELECT id FROM exam.attempts
          WHERE status = 'running' AND deadline_at IS NOT NULL AND deadline_at < NOW()`,
      );
  return rows.map((r) => r.id);
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

/**
 * 재접속 관측 이벤트(append-only) — 단, 직전 reconnect 가 withinSec 이내면 기록 생략(디바운스).
 * 새로고침/폴링마다 쌓이지 않게 — "다시 돌아왔다"의 의미가 있는 간격에서만 한 줄 남긴다.
 * 반환: 실제로 기록했는지 여부.
 */
export async function recordReconnectIfStale(attemptId: string, withinSec = 300): Promise<boolean> {
  const res = await queryOne<{ id: string }>(
    `INSERT INTO exam.attempt_events (attempt_id, type, detail)
     SELECT $1, 'reconnect', '{}'::jsonb
      WHERE NOT EXISTS (
        SELECT 1 FROM exam.attempt_events
         WHERE attempt_id = $1 AND type = 'reconnect'
           AND created_at > NOW() - make_interval(secs => $2))
     RETURNING id`,
    [attemptId, withinSec],
  );
  return res != null;
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

/* ── 과정 추적(상호작용 스냅샷). 근거: docs/10. attempt_events(type='turn'|'snapshot')를 재사용. ── */

/** 프록시 턴 이벤트(append-only) — "AI 응답 완료"의 근거. 워커가 이 신호로 스냅샷을 트리거한다.
 *  detail: turnIndex(직전 대화 턴), model(게이트웨이가 강제한 모델). running 상태에서만 기록. */
export async function recordTurnEvent(
  attemptId: string,
  detail: { turnIndex?: number; model?: string } = {},
): Promise<boolean> {
  const res = await queryOne<{ id: string }>(
    `INSERT INTO exam.attempt_events (attempt_id, type, detail)
     SELECT $1, 'turn', $2::jsonb
      WHERE EXISTS (SELECT 1 FROM exam.attempts WHERE id = $1 AND status = 'running')
     RETURNING id`,
    [attemptId, JSON.stringify(detail)],
  );
  return res != null;
}

export interface SnapshotEventInput {
  ref: string; // MinIO 키(고유): exam-snapshots/<dir>/<ts>.tgz — dedupe 키
  sha256: string; // 서버 워커가 산출(봉인)
  sizeBytes: number; // tgz 크기
  trigger: string; // 'turn' (현재 유일) | 'change-tick'(옵션 B, 향후)
  turnIndex?: number; // 직전 대화 턴
  fileCount?: number; // 스냅샷에 담긴 파일 수
}

export interface SnapshotEventResult {
  recorded: boolean; // false = 같은 ref가 이미 존재(워커 재시도/중복 콜백 멱등 통과)
  seq: number | null; // 사람이 읽는 순번(insert 시 MAX+1로 부여). recorded=false면 null
}

/** 스냅샷 등록 이벤트(append-only). MinIO 실체의 포인터+메타.
 *  순번 seq는 insert 시점에 기존 최대+1로 부여(앱이 미리 안 정함 → 사전배정 race 제거).
 *  멱등: 같은 ref가 이미 있으면 기록 생략 — ref가 고유(타임스탬프 키)라 워커 재시도에 안전. */
export async function recordSnapshotEvent(
  attemptId: string,
  input: SnapshotEventInput,
): Promise<SnapshotEventResult> {
  const res = await queryOne<{ seq: number }>(
    `INSERT INTO exam.attempt_events (attempt_id, type, detail)
     SELECT $1, 'snapshot',
            jsonb_build_object(
              'seq',
              COALESCE((SELECT MAX((detail->>'seq')::int) FROM exam.attempt_events
                         WHERE attempt_id = $1 AND type = 'snapshot'), 0) + 1
            ) || $2::jsonb
      WHERE NOT EXISTS (
        SELECT 1 FROM exam.attempt_events
         WHERE attempt_id = $1 AND type = 'snapshot' AND detail->>'ref' = $3)
     RETURNING (detail->>'seq')::int AS seq`,
    [attemptId, JSON.stringify(input), input.ref],
  );
  return { recorded: res != null, seq: res?.seq ?? null };
}

/** 워커 debounce 판단용: 마지막 스냅샷 시각(없으면 null). */
export async function lastSnapshotAt(attemptId: string): Promise<Date | null> {
  const row = await queryOne<{ created_at: Date }>(
    `SELECT created_at FROM exam.attempt_events
      WHERE attempt_id = $1 AND type = 'snapshot'
      ORDER BY created_at DESC, id DESC LIMIT 1`,
    [attemptId],
  );
  return row?.created_at ?? null;
}

export interface EffectiveSnapshotConfig {
  enabled: boolean;
  excludePatterns: string[]; // 기본 제외 + 문제별 제외(병합)
  debounceSec: number;
}

/** 워커용: attempt의 유효 스냅샷 설정. problem_version.snapshot_config(불변)를 조인해
 *  기본 제외 목록과 병합한다. attempt 없으면 null. */
export async function findSnapshotConfig(attemptId: string): Promise<EffectiveSnapshotConfig | null> {
  const r = await queryOne<{
    snapshot_config: { enabled?: boolean; excludePatterns?: string[]; debounceSec?: number } | null;
  }>(
    `SELECT v.snapshot_config
       FROM exam.attempts a
       JOIN exam.batches b ON b.id = a.batch_id
       JOIN exam.problem_versions v ON v.id = b.problem_version_id
      WHERE a.id = $1`,
    [attemptId],
  );
  if (!r) return null;
  const cfg = r.snapshot_config ?? {};
  return {
    enabled: cfg.enabled ?? true,
    excludePatterns: [...DEFAULT_EXCLUDE_PATTERNS, ...(cfg.excludePatterns ?? [])],
    debounceSec: cfg.debounceSec ?? 30,
  };
}
