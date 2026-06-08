import 'server-only';
import * as submissionsRepo from '../db/repositories/submissions';
import type { SubmissionDetail, SubmissionFile } from '../db/repositories/submissions';

// submissionService — 제출 조회(admin). 제출 상세 + 파일 목록 조립.
// proxy 캡처 제출은 hosted 전달 경로가 산출한다(이 서비스는 읽기만).

// 제출 검증 상세(admin). 상세 + 파일 목록. admin 권한은 라우트가 보장(여기선 조립만).
export async function getDetail(id: string): Promise<{ detail: SubmissionDetail; files: SubmissionFile[] } | null> {
  const detail = await submissionsRepo.findDetailById(id);
  if (!detail) return null;
  const files = await submissionsRepo.listFiles(id);
  return { detail, files };
}
