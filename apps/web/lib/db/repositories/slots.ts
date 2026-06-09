import 'server-only';
import type { PoolClient } from 'pg';
import { queryOne, getPool } from '../pool';

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
}

interface SlotRow {
  batch_id: string;
  slot_no: number;
  attempt_id: string | null;
  state: SlotState;
  endpoint: string | null;
  last_heartbeat_at: Date | null;
}

function mapRow(r: SlotRow): Slot {
  return {
    batchId: r.batch_id,
    slotNo: r.slot_no,
    attemptId: r.attempt_id,
    state: r.state,
    endpoint: r.endpoint,
    lastHeartbeatAt: r.last_heartbeat_at,
  };
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
): Promise<{ slotNo: number; endpoint: string | null; state: SlotState } | null> {
  const row = await queryOne<{ slot_no: number; endpoint: string | null; state: SlotState }>(
    `SELECT slot_no, endpoint, state FROM hosted.slots WHERE attempt_id = $1`,
    [attemptId],
  );
  if (!row) return null;
  return { slotNo: row.slot_no, endpoint: row.endpoint, state: row.state };
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
  input: { batchId: string; slotNo: number; endpoint: string },
): Promise<void> {
  await client.query(
    `INSERT INTO hosted.slots (batch_id, slot_no, state, endpoint, last_heartbeat_at)
     VALUES ($1, $2, 'ready', $3, NOW())
     ON CONFLICT (batch_id, slot_no)
     DO UPDATE SET endpoint          = EXCLUDED.endpoint,
                   last_heartbeat_at = NOW(),
                   state             = CASE
                     WHEN hosted.slots.state IN ('down','warming','ready')
                     THEN 'ready'
                     ELSE hosted.slots.state
                   END`,
    [input.batchId, input.slotNo, input.endpoint],
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

// mapRow은 내부 헬퍼로만 사용(외부 Slot 전체 조회 필요 시 확장).
export { mapRow as _mapSlotRow };
