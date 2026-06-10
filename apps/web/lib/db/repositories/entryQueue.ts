import 'server-only';
import type { PoolClient } from 'pg';
import { queryOne, getPool } from '../pool';

// entry_queue repository — ready 슬롯이 없을 때의 FIFO 입장 큐(0013). docs/6 Phase 3 워밍 풀.
// ⭐ 큐는 "배정 전"의 상태일 뿐 — 배정 자체는 slots의 SKIP LOCKED 트랜잭션이 한다(hot path 불변).

/** 대기 등록(멱등 — 이미 줄에 있으면 no-op). 시작 클릭 시 ready 슬롯이 없을 때만 호출. */
export async function enqueueTx(client: PoolClient, batchId: string, attemptId: string): Promise<void> {
  await client.query(
    `INSERT INTO hosted.entry_queue (attempt_id, batch_id) VALUES ($2, $1)
     ON CONFLICT (attempt_id) DO NOTHING`,
    [batchId, attemptId],
  );
}

/** 배정 완료/이탈 시 줄에서 제거. */
export async function removeTx(client: PoolClient, attemptId: string): Promise<void> {
  await client.query(`DELETE FROM hosted.entry_queue WHERE attempt_id=$1`, [attemptId]);
}

/** 내 대기 순번(1부터). 줄에 없으면 null. */
export async function positionOf(attemptId: string): Promise<number | null> {
  const row = await queryOne<{ pos: string }>(
    `SELECT COUNT(*) + 1 AS pos
       FROM hosted.entry_queue q
      WHERE q.batch_id = (SELECT batch_id FROM hosted.entry_queue WHERE attempt_id=$1)
        AND q.enqueued_at < (SELECT enqueued_at FROM hosted.entry_queue WHERE attempt_id=$1)`,
    [attemptId],
  );
  // 줄에 없으면 서브쿼리가 NULL → pos=1로 나오므로 존재를 따로 확인.
  const exists = await queryOne<{ ok: number }>(
    `SELECT 1 AS ok FROM hosted.entry_queue WHERE attempt_id=$1`,
    [attemptId],
  );
  if (!exists) return null;
  return Number(row?.pos ?? 1);
}

/** 회차 대기 인원(스케일 산정용). */
export async function countWaiting(batchId: string): Promise<number> {
  const row = await queryOne<{ n: string }>(
    `SELECT COUNT(*) AS n FROM hosted.entry_queue WHERE batch_id=$1`,
    [batchId],
  );
  return Number(row?.n ?? 0);
}

/**
 * 큐 head 1명을 잠그고 반환(FIFO·SKIP LOCKED — reconcile 동시 실행 안전).
 * 호출부가 같은 트랜잭션에서 슬롯 배정 성공 시 removeTx로 행을 지운다.
 */
export async function lockHeadTx(client: PoolClient, batchId: string): Promise<string | null> {
  const res = await client.query<{ attempt_id: string }>(
    `SELECT attempt_id FROM hosted.entry_queue
      WHERE batch_id=$1
      ORDER BY enqueued_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1`,
    [batchId],
  );
  return res.rows[0]?.attempt_id ?? null;
}

/** 큐 비우기(회차 close 시 잔여 대기 정리). */
export async function clearBatch(batchId: string): Promise<void> {
  await getPool().query(`DELETE FROM hosted.entry_queue WHERE batch_id=$1`, [batchId]);
}
