import { ok, fail } from '@/lib/http';
import { env } from '@/lib/env';
import { recordSnapshotEvent } from '@/lib/db/repositories/attempts';

// POST /api/internal/attempts/snapshot — 스냅샷 워커가 PVC를 tar+sha256 → MinIO 적재 후 등록 콜백.
// 근거: docs/10 §5·§7. 실체는 MinIO(exam-snapshots), 여기엔 포인터+메타(detail JSONB)만.
// sha256·sizeBytes는 워커(컨테이너 밖)가 산출 — 학생 입력 아님(trust='verified' 근거).
// 멱등: (attemptId, seq)가 키 — 워커 재시도 시 중복 행 안 생김.

export const dynamic = 'force-dynamic';

const SHA256_RE = /^[0-9a-f]{64}$/;
const VALID_TRIGGERS = new Set(['turn', 'change-tick']);

export async function POST(req: Request) {
  // ── 1. shared secret 검증 ──
  const secret = req.headers.get('x-internal-secret') ?? '';
  const expected = env.internalApiSecret;
  if (!expected || secret !== expected) {
    return fail('unauthorized', 'x-internal-secret 헤더가 올바르지 않습니다.', 401);
  }

  // ── 2. body 파싱 ──
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid_body', '요청 본문을 JSON으로 파싱할 수 없습니다.');
  }
  if (typeof body !== 'object' || body === null) {
    return fail('invalid_body', '요청 본문이 객체여야 합니다.');
  }

  const { attemptId, ref, sha256, sizeBytes, trigger, turnIndex, fileCount } =
    body as Record<string, unknown>;

  // ── 3. body 검증 (seq는 서버가 부여 — 클라 입력 아님) ──
  if (typeof attemptId !== 'string' || attemptId.trim() === '') {
    return fail('invalid_body', 'attemptId(string)가 필요합니다.');
  }
  if (typeof ref !== 'string' || ref.trim() === '') {
    return fail('invalid_body', 'ref(string, MinIO 객체 키)가 필요합니다.');
  }
  if (typeof sha256 !== 'string' || !SHA256_RE.test(sha256)) {
    return fail('invalid_body', 'sha256(hex 64자)이 필요합니다.');
  }
  if (!Number.isInteger(sizeBytes) || (sizeBytes as number) < 0) {
    return fail('invalid_body', 'sizeBytes(int >= 0)가 필요합니다.');
  }
  if (typeof trigger !== 'string' || !VALID_TRIGGERS.has(trigger)) {
    return fail('invalid_body', "trigger는 'turn' | 'change-tick' 여야 합니다.");
  }
  if (turnIndex != null && (!Number.isInteger(turnIndex) || (turnIndex as number) < 0)) {
    return fail('invalid_body', 'turnIndex는 0 이상의 정수여야 합니다.');
  }
  if (fileCount != null && (!Number.isInteger(fileCount) || (fileCount as number) < 0)) {
    return fail('invalid_body', 'fileCount는 0 이상의 정수여야 합니다.');
  }

  // ── 4. 스냅샷 이벤트 등록(멱등, seq는 insert 시 MAX+1 부여) ──
  const result = await recordSnapshotEvent(attemptId.trim(), {
    ref: ref.trim(),
    sha256,
    sizeBytes: sizeBytes as number,
    trigger,
    ...(turnIndex != null ? { turnIndex: turnIndex as number } : {}),
    ...(fileCount != null ? { fileCount: fileCount as number } : {}),
  });

  // recorded=false = 같은 ref 이미 존재(멱등 통과) → 성공 응답(워커 재시도 정상 종료).
  return ok(result);
}
