#!/usr/bin/env node
// collector — 학생 컨테이너가 남긴 claude code 대화(transcript)를 회수해 정규화·봉인한다.
// (docs/2-exam-environment.md §10 정규화 포맷, §8 trust=서버측 해시 봉인, 방식 C)
//
//   입력: runtime/<attempt>/.claude/projects/**/*.jsonl   ← claude code가 자동 기록한 세션 transcript
//   출력: out/<attempt>/chat-log.v1.json        ← §10 v1 정규화 포맷(평가 모듈이 소비할 단일 모양)
//         out/<attempt>/chat-log.v1.json.sha256 ← 봉인(위조 탐지). transcript는 컨테이너 내부 파일이라
//                                                  학생이 손댈 수 있으므로 "즉시 회수 + 해시"로 trust 확보.
//         out/<attempt>/raw/                     ← 원본 jsonl 보존(감사 추적)
//
// 사용: node collect.mjs <attemptId>     (생략 시 env ATTEMPT_ID 또는 'spike-1')
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');                       // experiments/s1-docker-spike
const attempt = process.argv[2] || process.env.ATTEMPT_ID || 'spike-1';

const projectsDir = join(ROOT, 'runtime', attempt, '.claude', 'projects');
const outDir = join(ROOT, 'out', attempt);

// ── 재귀적으로 *.jsonl 수집 (deps 없이) ───────────────────────────────────────
function findJsonl(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...findJsonl(p));
    else if (name.endsWith('.jsonl')) out.push(p);
  }
  return out;
}

// ── claude code transcript 한 줄 → 정규화 메시지(없으면 null) ─────────────────
// transcript의 content는 string 이거나 block 배열({type:text|tool_use|tool_result,...}).
function normalizeLine(obj) {
  if (!obj || (obj.type !== 'user' && obj.type !== 'assistant')) return null;
  const msg = obj.message || {};
  const role = msg.role || obj.type;
  const raw = msg.content;

  let text = '';
  const toolCalls = [];
  const attachments = [];

  if (typeof raw === 'string') {
    text = raw;
  } else if (Array.isArray(raw)) {
    for (const block of raw) {
      if (!block || typeof block !== 'object') continue;
      if (block.type === 'text') text += (text ? '\n' : '') + (block.text || '');
      else if (block.type === 'tool_use') toolCalls.push({ id: block.id, name: block.name, input: block.input });
      else if (block.type === 'tool_result') {
        // tool_result는 user 턴에 끼어든 도구 출력 — 본문이 아니라 첨부로 둔다.
        attachments.push({ kind: 'tool_result', toolUseId: block.tool_use_id, content: block.content });
      } else if (block.type === 'image') {
        attachments.push({ kind: 'image', source: block.source?.type || 'unknown' });
      }
    }
  }

  return {
    id: obj.uuid || null,
    role,
    content: text,
    ts: obj.timestamp || null,
    tool_calls: toolCalls,
    attachments,
    _model: msg.model || null,          // 메타용(아래에서 추출 후 제거)
  };
}

// ── 회수 ──────────────────────────────────────────────────────────────────────
const files = findJsonl(projectsDir).sort();
if (files.length === 0) {
  console.error(`[collect] transcript 없음: ${projectsDir}`);
  console.error(`[collect] → 컨테이너에서 claude code로 대화했는지 확인(대화하면 ~/.claude/projects에 transcript가 쌓인다).`);
  process.exit(1);
}

const messages = [];
let model = null;
let lineCount = 0;
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    lineCount++;
    let obj;
    try { obj = JSON.parse(t); } catch { continue; }   // 비-JSON 줄은 건너뛴다
    const m = normalizeLine(obj);
    if (!m) continue;
    if (m._model) model = m._model;
    delete m._model;
    messages.push(m);
  }
}

// 시간순 정렬 후 index 재부여 (여러 세션·파일을 한 줄기로 합친다)
messages.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
messages.forEach((m, i) => { m.index = i; });

// ── 원본 보존(raw) + sourceHash 산출 ──────────────────────────────────────────
const rawDir = join(outDir, 'raw');
mkdirSync(rawDir, { recursive: true });
const sourceHasher = createHash('sha256');
for (const f of files) {
  const buf = readFileSync(f);
  sourceHasher.update(buf);
  copyFileSync(f, join(rawDir, relative(projectsDir, f).replaceAll('/', '__')));
}
const sourceHash = 'sha256:' + sourceHasher.digest('hex');

// ── §10 v1 정규화 포맷 ────────────────────────────────────────────────────────
const normalized = {
  version: 1,
  tool: 'claude-code',
  model,
  messages,
  meta: {
    attemptId: attempt,
    source: 'transcript',          // §10은 proxy|export-script — 방식 C는 transcript 회수(README에 명시)
    sourceHash,
  },
};

mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, 'chat-log.v1.json');
const payload = JSON.stringify(normalized, null, 2);
writeFileSync(outFile, payload);

// 봉인: 정규화 산출물 자체의 해시(위조 탐지)
const sealed = 'sha256:' + createHash('sha256').update(payload).digest('hex');
writeFileSync(outFile + '.sha256', sealed + '  chat-log.v1.json\n');

console.log(`[collect] attempt=${attempt}`);
console.log(`[collect] transcript 파일 ${files.length}개, 원시 라인 ${lineCount}줄 → 정규화 메시지 ${messages.length}건`);
console.log(`[collect] model=${model ?? '(unknown)'}  sourceHash=${sourceHash.slice(0, 23)}…`);
console.log(`[collect] → ${relative(ROOT, outFile)}  (봉인 ${sealed.slice(0, 23)}…)`);
