import 'server-only';
import type { PoolClient } from 'pg';
import { queryOne } from '../pool';

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

// mapRow은 내부 헬퍼로만 사용(외부 Slot 전체 조회 필요 시 확장).
export { mapRow as _mapSlotRow };
