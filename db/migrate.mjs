#!/usr/bin/env node
// 마이그레이션 러너 — db/migrations/*.sql 를 순서대로, 각각 트랜잭션으로 적용.
// 근거: reference/02 §13(DDL은 BEGIN;...COMMIT; 트랜잭션). 도구 대신 작은 러너 — 단순함은 의도된 선택(대원칙 ③).
//
// 사용:
//   node db/migrate.mjs          # 미적용 마이그레이션 전부 적용
//   node db/migrate.mjs status   # 적용/미적용 목록만 출력
// 환경: DATABASE_URL (.env.secret에서 로드). docker compose up -d 로 postgres 준비 후 실행.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

// cwd 와 무관하게 레포 루트의 .env.secret 을 로드(이미 process.env 에 있으면 덮어쓰지 않음).
loadEnv({ path: resolve(__dirname, '..', '.env.secret') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('✗ DATABASE_URL 이 설정되지 않았습니다. .env.secret 을 확인하세요 (.env.secret.example 참고).');
  process.exit(1);
}

const mode = process.argv[2] ?? 'apply';

function listMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // 0001_, 0002_ ... 파일명 접두 순서가 곧 적용 순서
}

async function main() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    // 적용 이력 테이블(public). 멱등 보장의 단일 근거.
    await client.query(`
      CREATE TABLE IF NOT EXISTS public._migrations (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const applied = new Set(
      (await client.query('SELECT name FROM public._migrations')).rows.map((r) => r.name),
    );
    const all = listMigrations();
    const pending = all.filter((f) => !applied.has(f));

    if (mode === 'status') {
      for (const f of all) console.log(`${applied.has(f) ? '✓ applied ' : '· pending '} ${f}`);
      console.log(`\n총 ${all.length}개 · 적용 ${applied.size}개 · 미적용 ${pending.length}개`);
      return;
    }

    if (pending.length === 0) {
      console.log('✓ 적용할 마이그레이션이 없습니다 (최신 상태).');
      return;
    }

    for (const file of pending) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      process.stdout.write(`→ ${file} ... `);
      try {
        await client.query('BEGIN');
        await client.query(sql); // 단일 query에 다중 statement(파라미터 없을 때 허용)
        await client.query('INSERT INTO public._migrations(name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log('done');
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`\n✗ ${file} 적용 실패 — 롤백됨.\n${err.message}`);
        process.exit(1);
      }
    }
    console.log(`\n✓ ${pending.length}개 마이그레이션 적용 완료.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
