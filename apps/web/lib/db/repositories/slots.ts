import 'server-only';
import type { PoolClient } from 'pg';
import { query, queryOne, getPool } from '../pool';

// slots repository — hosted 슬롯 할당 데이터 레이어(hot path).
// 근거: docs/2 §6(원자 배정·SKIP LOCKED), 0004_hosted.sql + 0008_slot_window_states.sql.
// ⭐ attempt_id가 slot↔attempt 1:1 매핑의 유일한 곳 — attempts에는 slot 컬럼 없음.

export type SlotState = 'down' | 'warming' | 'ready' | 'assigned' | 'submitting' | 'recycling';

export interface Slot {
  batchId: string;
  slotNo: number;
  attemptId: string | null;
  state: SlotState;
  endpoint: string | null;
  lastHeartbeatAt: Date | null;
  /** LiteLLM 가상키(provision 시 발급, close 시 revoke·NULL). 0012. */
  virtualKey: string | null;
}

interface SlotRow {
  batch_id: string;
  slot_no: number;
  attempt_id: string | null;
  state: SlotState;
  endpoint: string | null;
  last_heartbeat_at: Date | null;
  virtual_key: string | null;
}

function mapRow(r: SlotRow): Slot {
  return {
    batchId: r.batch_id,
    slotNo: r.slot_no,
    attemptId: r.attempt_id,
    state: r.state,
    endpoint: r.endpoint,
    lastHeartbeatAt: r.last_heartbeat_at,
    virtualKey: r.virtual_key,
  };
}

/**
 * 트랜잭션 안에서 attempt의 기존 슬롯 조회 — 재시작(재접속 후 시작 재클릭) 멱등 처리용.
 * ⚠️ 이 확인 없이 assignReadySlotTx를 또 타면 attempt_id UNIQUE 위반(두 번째 슬롯 점유 시도).
 */
export async function findSlotByAttemptTx(
  client: PoolClient,
  attemptId: string,
): Promise<{ slotNo: number; endpoint: string | null } | null> {
  const res = await client.query<{ slot_no: number; endpoint: string | null }>(
    `SELECT slot_no, endpoint FROM hosted.slots WHERE attempt_id = $1`,
    [attemptId],
  );
  const row = res.rows[0];
  return row ? { slotNo: row.slot_no, endpoint: row.endpoint } : null;
}

/**
 * 원자 슬롯 배정(hot path). docs/2 §6 배정 SQL 그대로.
 *
 * FOR UPDATE SKIP LOCKED: 5명 동시 클릭 시 각자 서로 다른 슬롯을 잡도록 보장.
 * ready 슬롯이 없으면 null 반환(Phase 2/3에서 슬롯 풀 상시 존재 시 대기 로직으로 강화 예정).
 */
export async function assignReadySlotTx(
  client: PoolClient,
  batchId: string,
  attemptId: string,
): Promise<{ slotNo: number; endpoint: string | null } | null> {
  const res = await client.query<{ slot_no: number; endpoint: string | null }>(
    `UPDATE hosted.slots SET state='assigned', attempt_id=$2
      WHERE (batch_id, slot_no) = (
        SELECT batch_id, slot_no FROM hosted.slots
         WHERE batch_id=$1 AND state='ready'
         ORDER BY slot_no
         FOR UPDATE SKIP LOCKED
         LIMIT 1
      )
      RETURNING slot_no, endpoint`,
    [batchId, attemptId],
  );
  const row = res.rows[0];
  if (!row) return null;
  return { slotNo: row.slot_no, endpoint: row.endpoint };
}

/**
 * 런타임 iframe용: attempt_id로 현재 배정된 슬롯 조회.
 * attempt_id UNIQUE 제약으로 최대 1행.
 */
export async function findActiveSlotByAttempt(
  attemptId: string,
): Promise<{ batchId: string; slotNo: number; endpoint: string | null; state: SlotState } | null> {
  const row = await queryOne<{ batch_id: string; slot_no: number; endpoint: string | null; state: SlotState }>(
    `SELECT batch_id, slot_no, endpoint, state FROM hosted.slots WHERE attempt_id = $1`,
    [attemptId],
  );
  if (!row) return null;
  return { batchId: row.batch_id, slotNo: row.slot_no, endpoint: row.endpoint, state: row.state };
}

/**
 * 제출 시작 시 슬롯 state → submitting.
 * assigned 상태에서만 전이(이미 recycling/submitting이면 no-op).
 * Phase 3 패키징 Job 연동 토대.
 */
export async function markSubmittingTx(client: PoolClient, attemptId: string): Promise<void> {
  await client.query(
    `UPDATE hosted.slots SET state='submitting' WHERE attempt_id=$1 AND state='assigned'`,
    [attemptId],
  );
}

/**
 * pod 부팅 시 슬롯 등록(upsert). docs/2 §3④·§6.
 * 이미 attempt에 배정된(assigned/submitting/recycling) 슬롯의 state는 덮지 않는다.
 * 단일 쿼리라 트랜잭션 불필요 — 트랜잭션 중 쓰는 경우를 위해 client를 받는다.
 */
export async function registerSlotTx(
  client: PoolClient,
  input: { batchId: string; slotNo: number; endpoint: string; virtualKey?: string | null },
): Promise<void> {
  await client.query(
    `INSERT INTO hosted.slots (batch_id, slot_no, state, endpoint, last_heartbeat_at, virtual_key)
     VALUES ($1, $2, 'ready', $3, NOW(), $4)
     ON CONFLICT (batch_id, slot_no)
     DO UPDATE SET endpoint          = EXCLUDED.endpoint,
                   last_heartbeat_at = NOW(),
                   virtual_key       = COALESCE(EXCLUDED.virtual_key, hosted.slots.virtual_key),
                   state             = CASE
                     WHEN hosted.slots.state IN ('down','warming','ready')
                     THEN 'ready'
                     ELSE hosted.slots.state
                   END`,
    [input.batchId, input.slotNo, input.endpoint, input.virtualKey ?? null],
  );
}

/**
 * 슬롯 heartbeat — last_heartbeat_at 갱신. 없는 슬롯이면 false 반환.
 * 단일 UPDATE라 트랜잭션 불필요. rowCount 필요하므로 getPool().query() 직접 사용.
 */
export async function heartbeat(batchId: string, slotNo: number): Promise<boolean> {
  const res = await getPool().query(
    `UPDATE hosted.slots SET last_heartbeat_at = NOW()
     WHERE batch_id = $1 AND slot_no = $2`,
    [batchId, slotNo],
  );
  return (res.rowCount ?? 0) > 0;
}

/** 회차의 슬롯 전체(운영 뷰·close 시 가상키 회수용). */
export async function listByBatch(batchId: string): Promise<Slot[]> {
  const rows = await query<SlotRow>(
    `SELECT * FROM hosted.slots WHERE batch_id = $1 ORDER BY slot_no`,
    [batchId],
  );
  return rows.map(mapRow);
}

/**
 * 패키징 완료 시 슬롯 state → recycling(재배정 금지 상태, 0008).
 * submitting에서만 전이(assigned에서 바로 오는 강제 제출 직후도 markSubmittingTx가 선행).
 */
export async function markRecyclingTx(client: PoolClient, attemptId: string): Promise<void> {
  await client.query(
    `UPDATE hosted.slots SET state='recycling' WHERE attempt_id=$1 AND state IN ('assigned','submitting')`,
    [attemptId],
  );
}

/**
 * 진행 중(배정/제출 중) 슬롯이 존재하는가 — provision 가드.
 * 단일 StatefulSet·단일 exam-batch ConfigMap 구조라 동시에 한 회차만 띄울 수 있다(docs/6 로컬 제약).
 * 다른 회차가 진행 중이면 PVC wipe가 작업물을 파괴하므로 provision을 거부한다.
 */
export async function hasBusySlots(): Promise<boolean> {
  const row = await queryOne<{ ok: number }>(
    `SELECT 1 AS ok FROM hosted.slots WHERE state IN ('assigned','submitting') LIMIT 1`,
  );
  return !!row;
}

/**
 * provision 직전 이 회차 슬롯 초기화: 전부 down + attempt/가상키 해제.
 * (이전 회차 운영의 잔재 제거 — attempt별 기록은 attempt_events·submissions에 남는다.)
 */
export async function resetBatchSlots(batchId: string): Promise<void> {
  await getPool().query(
    `UPDATE hosted.slots SET state='down', attempt_id=NULL, virtual_key=NULL WHERE batch_id=$1`,
    [batchId],
  );
}

/**
 * close 시 슬롯 상태머신 처리: 이 회차 슬롯 전부 down + 가상키 해제(revoke는 호출부가 게이트웨이에).
 * attempt_id는 남긴다(어느 슬롯이 어느 응시를 서빙했는지 감사 — 다음 provision의 reset이 정리).
 */
export async function markBatchDown(batchId: string): Promise<void> {
  await getPool().query(
    `UPDATE hosted.slots SET state='down', virtual_key=NULL WHERE batch_id=$1`,
    [batchId],
  );
}

// mapRow은 내부 헬퍼로만 사용(외부 Slot 전체 조회 필요 시 확장).
export { mapRow as _mapSlotRow };
