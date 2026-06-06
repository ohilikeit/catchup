import 'server-only';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { env } from '../env';

// 단일 pg Pool(프로세스당 1개). DB는 정보원이므로 캐시와 달리 hard dependency.
// 근거: reference/01 §5(부팅 헬스체크·풀), 09(DB 풀 상한으로 커넥션 고갈 방지).
//
// ⚠️ 지연 생성: 모듈 import 시점에 Pool을 만들지 않는다(빌드 타임엔 env가 없음).
// 첫 쿼리에서 getPool()이 생성·메모이즈. Next dev HMR 누적 방지를 위해 globalThis 캐시.
declare global {
  // eslint-disable-next-line no-var
  var __catchupPgPool: Pool | undefined;
}

export function getPool(): Pool {
  if (!globalThis.__catchupPgPool) {
    globalThis.__catchupPgPool = new Pool({
      connectionString: env.databaseUrl,
      max: env.dbPoolMax,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return globalThis.__catchupPgPool;
}

/**
 * 파라미터 바인딩 쿼리 단일 진입점. 문자열 연결 금지($1 바인딩만) — SQL 인젝션 차단(reference/02 §14).
 * 제네릭 Row 로 호출부에서 행 타입을 지정한다.
 */
export async function query<Row extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<Row[]> {
  const res = await getPool().query<Row>(text, params as unknown[]);
  return res.rows;
}

/** 단일 행 헬퍼(없으면 null). */
export async function queryOne<Row extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<Row | null> {
  const rows = await query<Row>(text, params);
  return rows[0] ?? null;
}

/**
 * 트랜잭션 헬퍼. fn 안에서 같은 client 로 여러 쿼리를 묶고, 예외 시 자동 롤백.
 * 예: deadline 재판정 + submission 적재처럼 원자성이 필요한 곳(docs/1 §4).
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** 부팅/헬스 체크: DB가 실제로 쿼리를 받는지. */
export async function pingDb(): Promise<boolean> {
  try {
    await getPool().query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
