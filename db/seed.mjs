#!/usr/bin/env node
// 데모 시드 — 대시보드·목록·상태 화면을 채울 현실적 표본 데이터(멱등·재실행 가능).
// 근거: docs/1 §2·§3·§4. 자연키(ON CONFLICT)로 재실행해도 중복 없이 동일 상태에 수렴.
//
// 사용:  node db/seed.mjs   (docker compose up -d + db:migrate 이후)
// 환경:  DATABASE_URL (.env.secret). migrate.mjs와 동일 로딩.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '..', '.env.secret') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('✗ DATABASE_URL 이 설정되지 않았습니다 (.env.secret 확인).');
  process.exit(1);
}

// ⭐ 안전장치: 이 시드는 알려진 데모 비밀번호(demo1234)를 심으므로 개발 전용이다.
// production에서는 명시적 SEED_ALLOW_DEMO_ACCOUNTS=1 없이는 절대 실행하지 않는다(자격증명 유출 방지).
if (process.env.NODE_ENV === 'production' && process.env.SEED_ALLOW_DEMO_ACCOUNTS !== '1') {
  console.error('✗ production에서는 데모 시드를 거부합니다. 정말 필요하면 SEED_ALLOW_DEMO_ACCOUNTS=1 로 명시하세요.');
  console.error('  (이 시드는 demo1234 같은 알려진 비밀번호를 심습니다 — 운영 환경엔 부적합)');
  process.exit(1);
}

const SHA = 'sha256:' + 'a'.repeat(64);
const HEX64 = 'a'.repeat(64);

// 데모 계정 공통 비밀번호 'demo1234'의 bcrypt 해시(평문 저장 금지 — 해시만).
// 로그인 페이지의 DEMO_PASSWORD와 일치. 재시드 시 데모 비번을 demo1234로 리셋(멱등).
const DEMO_PW_HASH = '$2b$10$CZ8x307dCrRgW4qEvCNIxuYJ9/k96rCYm0JTTpEpGImFS3qUjeNF2';

async function main() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');

    // ── 조직(대학) ────────────────────────────────────────────────
    const orgA = (await client.query(
      `INSERT INTO auth.organizations (name, code) VALUES ($1, $2)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      ['A대학교', 'UNIV-A'],
    )).rows[0].id;
    const orgB = (await client.query(
      `INSERT INTO auth.organizations (name, code) VALUES ($1, $2)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      ['B대학교', 'UNIV-B'],
    )).rows[0].id;

    // ── 사용자 헬퍼(이메일 멱등) ──────────────────────────────────
    async function upsertUser(email, fullName) {
      // 데모 계정은 demo1234 해시 + password_changed_at=NOW()(변경 안내 비활성).
      return (await client.query(
        `INSERT INTO auth.users (email, full_name, password_hash, password_changed_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name,
           password_hash = EXCLUDED.password_hash, password_changed_at = NOW()
         RETURNING id`,
        [email.toLowerCase(), fullName, DEMO_PW_HASH],
      )).rows[0].id;
    }
    async function grantGlobal(userId, role) {
      await client.query(
        `INSERT INTO auth.user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, role],
      );
    }
    async function addMember(orgId, userId, orgRole, externalId) {
      await client.query(
        `INSERT INTO auth.org_members (org_id, user_id, org_role, external_id)
         VALUES ($1, $2, $3, $4) ON CONFLICT (org_id, user_id) DO UPDATE SET org_role = EXCLUDED.org_role`,
        [orgId, userId, orgRole, externalId],
      );
    }

    // 내부 관리자(전역 admin)
    const adminId = await upsertUser('admin@catchup.io', '관리자');
    await grantGlobal(adminId, 'admin');

    // 학교담당자(org_admin)
    const staffA = await upsertUser('staff@univ-a.ac.kr', 'A대학 담당자');
    await addMember(orgA, staffA, 'org_admin', null);
    const staffB = await upsertUser('staff@univ-b.ac.kr', 'B대학 담당자');
    await addMember(orgB, staffB, 'org_admin', null);

    // 학생(examinee)
    const studentsA = [];
    for (let i = 1; i <= 6; i++) {
      const id = await upsertUser(`student${i}@univ-a.ac.kr`, `A대학 학생${i}`);
      await addMember(orgA, id, 'examinee', `A-2026-${String(i).padStart(3, '0')}`);
      studentsA.push(id);
    }
    const studentsB = [];
    for (let i = 1; i <= 3; i++) {
      const id = await upsertUser(`student${i}@univ-b.ac.kr`, `B대학 학생${i}`);
      await addMember(orgB, id, 'examinee', `B-2026-${String(i).padStart(3, '0')}`);
      studentsB.push(id);
    }

    // ── 문제 + 불변 버전 ─────────────────────────────────────────
    await client.query(
      `INSERT INTO exam.problems (code, role_track, title) VALUES ($1, $2, $3)
       ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title`,
      ['planning', 'planning', '신규 서비스 기획 — AI 협업 과제'],
    );
    const pv = (await client.query(
      `INSERT INTO exam.problem_versions (problem_code, version, public_scaffold_ref, scaffold_sha256)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (problem_code, version) DO UPDATE SET public_scaffold_ref = EXCLUDED.public_scaffold_ref
       RETURNING id`,
      ['planning', 1, 'storage://scaffolds/planning-v1.zip', HEX64],
    )).rows[0].id;

    // ── 회차(자연키 없음 → org+name 조회 후 생성) ────────────────
    async function ensureBatch(orgId, name, status) {
      const found = await client.query('SELECT id FROM exam.batches WHERE org_id = $1 AND name = $2', [orgId, name]);
      if (found.rows[0]) return found.rows[0].id;
      const opened = status === 'open' ? 'NOW()' : 'NULL';
      const id = (await client.query(
        `INSERT INTO exam.batches (org_id, name, problem_version_id, status, scheduled_at, opened_at)
         VALUES ($1, $2, $3, $4, NOW(), ${opened}) RETURNING id`,
        [orgId, name, pv, status],
      )).rows[0].id;
      // 대표 문제(seq=1)를 batch_problems 에도 — provision 이 여기서 문제 목록을 읽는다(0018).
      await client.query(
        `INSERT INTO exam.batch_problems (batch_id, problem_version_id, seq) VALUES ($1, $2, 1) ON CONFLICT DO NOTHING`,
        [id, pv],
      );
      return id;
    }
    const batchA1 = await ensureBatch(orgA, '2026 가을 1회차', 'open');
    const batchA2 = await ensureBatch(orgA, '2026 가을 2회차', 'scheduled');
    const batchB1 = await ensureBatch(orgB, 'B대학 1회차', 'open');

    // ── 응시(멱등) ───────────────────────────────────────────────
    async function ensureAttempt(batchId, examineeId, status, withDeadline) {
      const found = await client.query(
        'SELECT id FROM exam.attempts WHERE batch_id = $1 AND examinee_id = $2',
        [batchId, examineeId],
      );
      if (found.rows[0]) return found.rows[0].id;
      const deadline = withDeadline ? "NOW() + INTERVAL '2 hours'" : 'NULL';
      const starts = status === 'ready' ? 'NULL' : 'NOW()';
      const submitted = status === 'submitted' ? 'NOW()' : 'NULL';
      return (await client.query(
        `INSERT INTO exam.attempts (batch_id, examinee_id, status, starts_at, deadline_at, submitted_at)
         VALUES ($1, $2, $3, ${starts}, ${deadline}, ${submitted}) RETURNING id`,
        [batchId, examineeId, status],
      )).rows[0].id;
    }

    // student1 진행중, student2/3 제출완료, 나머지 대기
    const aRunning = await ensureAttempt(batchA1, studentsA[0], 'running', true);
    const aSub1 = await ensureAttempt(batchA1, studentsA[1], 'submitted', true);
    const aSub2 = await ensureAttempt(batchA1, studentsA[2], 'submitted', true);
    for (let i = 3; i < studentsA.length; i++) await ensureAttempt(batchA1, studentsA[i], 'ready', false);
    for (const s of studentsB) await ensureAttempt(batchB1, s, 'ready', false);
    void aRunning;

    // ── 제출(accepted) + 파일 ────────────────────────────────────
    async function ensureSubmission(attemptId, capturedVia, trust) {
      const found = await client.query('SELECT id FROM exam.submissions WHERE attempt_id = $1', [attemptId]);
      let id;
      if (found.rows[0]) {
        id = found.rows[0].id;
      } else {
        id = (await client.query(
          `INSERT INTO exam.submissions (attempt_id, status, tool, captured_via, trust, accepted_at, submitted_at)
           VALUES ($1, 'accepted', 'claude-code', $2, $3, NOW(), NOW()) RETURNING id`,
          [attemptId, capturedVia, trust],
        )).rows[0].id;
      }
      // 파일은 멱등을 위해 sha256+kind 기준 중복 회피
      for (const [kind, ref] of [['chat_log', 'storage://chat.json'], ['artifact', 'storage://artifact.zip']]) {
        const f = await client.query(
          'SELECT id FROM exam.submission_files WHERE submission_id = $1 AND kind = $2',
          [id, kind],
        );
        if (!f.rows[0]) {
          await client.query(
            `INSERT INTO exam.submission_files (submission_id, kind, ref, sha256, size_bytes, mime)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, kind, ref, HEX64, 2048, kind === 'chat_log' ? 'application/json' : 'application/zip'],
          );
        }
      }
      return id;
    }
    await ensureSubmission(aSub1, 'proxy', 'verified');
    await ensureSubmission(aSub2, 'proxy', 'verified');
    void SHA;

    await client.query('COMMIT');
    console.log('✓ 데모 시드 완료: 대학2 · 학생9 · 회차3 · 응시9 · 제출2(accepted).');
    console.log('  로그인 비밀번호=demo1234 : admin@catchup.io / staff@univ-a.ac.kr / student1@univ-a.ac.kr');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('✗ 시드 실패 — 롤백됨.\n', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
