import 'server-only';
import { withTransaction } from '../db';
import * as problemsRepo from '../db/repositories/problems';
import type { RoleTrack } from '../db/repositories/problems';
import { putObject, sha256, sanitizeFilename, BUCKETS } from '../storage';

// problemService — 문제 버전 업로드(admin). route/action은 얇게, 검증·트랜잭션·스토리지 적재는 여기서.
// ⭐ scaffold 해시는 서버 재산출(클라 입력 신뢰 금지, 대원칙 ⑤). hidden은 서버 전용 버킷 — DB에 기록하지 않는다.

const ROLE_TRACKS: readonly RoleTrack[] = ['planning', 'dev', 'marketing'];
const CODE_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;

export interface UploadFilePart {
  filename: string;
  mime: string | null;
  bytes: Buffer;
}

/**
 * 문제 업로드: 문제 upsert → 다음 버전 → scaffold(필수)·hidden(선택) MinIO 적재 → 버전 INSERT.
 * 전부 한 트랜잭션(게이트→put→insert 순서, submitByod와 동형). 키가 결정적이라 재시도 안전.
 * scaffold ref는 `exam-scaffold/<code>/v<version>/<name>` 포인터로만 DB에 남는다(실체는 MinIO).
 */
export async function uploadProblemVersion(input: {
  code: string;
  roleTrack: string;
  title: string;
  scaffold: UploadFilePart;
  hidden?: UploadFilePart | null;
}): Promise<{ code: string; version: number }> {
  const code = input.code.trim();
  const title = input.title.trim();

  if (!CODE_RE.test(code)) {
    throw new Error('문제 코드는 영소문자·숫자·-·_ 로 2~64자여야 합니다(예: planning-a1).');
  }
  if (!ROLE_TRACKS.includes(input.roleTrack as RoleTrack)) {
    throw new Error('직무(role_track)는 planning · dev · marketing 중 하나여야 합니다.');
  }
  if (!title) {
    throw new Error('문제 제목을 입력하세요.');
  }
  if (!input.scaffold || input.scaffold.bytes.length === 0) {
    throw new Error('스캐폴드 파일을 선택하세요.');
  }
  const roleTrack = input.roleTrack as RoleTrack;
  const hidden = input.hidden && input.hidden.bytes.length > 0 ? input.hidden : null;

  return withTransaction(async (client) => {
    await problemsRepo.upsertProblemTx(client, code, roleTrack, title);
    const version = await problemsRepo.nextVersionTx(client, code);

    const scaffoldName = sanitizeFilename(input.scaffold.filename);
    await putObject(
      BUCKETS.scaffold,
      `${code}/v${version}/${scaffoldName}`,
      input.scaffold.bytes,
      input.scaffold.mime,
    );

    if (hidden) {
      await putObject(
        BUCKETS.hidden,
        `${code}/v${version}/${sanitizeFilename(hidden.filename)}`,
        hidden.bytes,
        hidden.mime,
      );
    }

    const saved = await problemsRepo.insertProblemVersionTx(client, {
      problemCode: code,
      version,
      publicScaffoldRef: `${BUCKETS.scaffold}/${code}/v${version}/${scaffoldName}`,
      scaffoldSha256: sha256(input.scaffold.bytes),
    });

    return { code, version: saved.version };
  });
}
