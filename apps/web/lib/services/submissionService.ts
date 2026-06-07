import 'server-only';
import { withTransaction } from '../db';
import * as attemptsRepo from '../db/repositories/attempts';
import * as submissionsRepo from '../db/repositories/submissions';
import { validateChatLog } from '../submission/chatLog';
import { CHAT_FORMAT_VERSION } from '../submission/chatLog';
import type { SubmissionFileInput, SubmissionDetail, SubmissionFile } from '../db/repositories/submissions';

// 제출 검증 상세(admin). 상세 + 파일 목록. admin 권한은 라우트가 보장(여기선 조립만).
export async function getDetail(id: string): Promise<{ detail: SubmissionDetail; files: SubmissionFile[] } | null> {
  const detail = await submissionsRepo.findDetailById(id);
  if (!detail) return null;
  const files = await submissionsRepo.listFiles(id);
  return { detail, files };
}

// submissionService — ⭐ BYOD 업로드 제출. 플랫폼 범위 = 수신·검증·적재(docs/1 §5.2).
// 핵심 불변식(모두 한 트랜잭션):
//   ① 소유권(examinee 일치)  ② 서버강제 deadline 재판정  ③ 정규화 포맷 검증  ④ accepted만 적재
// trust='unverified'는 서버가 어댑터 신원(upload)으로만 산출 — 클라가 못 정함(대원칙 ⑤).

export type SubmitOutcome =
  | { ok: true; submissionId: string }
  | { ok: false; code: 'not_found' | 'forbidden' | 'expired' | 'already' | 'invalid' | 'not_started'; message: string; details?: string[] };

export interface ByodSubmitInput {
  attemptId: string;
  examineeId: string;
  chatLog: unknown; // 업로드된 정규화 대화로그(검증 전)
  files: SubmissionFileInput[]; // chat_log/artifact 메타(실물은 스토리지)
  tool?: string | null;
}

export async function submitByod(input: ByodSubmitInput): Promise<SubmitOutcome> {
  // 검증은 트랜잭션 밖에서 먼저(락 보유 시간 최소화). 실패 시 DB 무변경 → 학생이 고쳐 재업로드 가능.
  const v = validateChatLog(input.chatLog, input.attemptId);
  if (!v.ok) {
    return { ok: false, code: 'invalid', message: '정규화 대화로그 검증에 실패했습니다.', details: v.errors };
  }

  return withTransaction(async (client) => {
    const attempt = await attemptsRepo.lockForSubmitTx(client, input.attemptId);
    if (!attempt) return { ok: false, code: 'not_found', message: '응시를 찾을 수 없습니다.' };
    if (attempt.examineeId !== input.examineeId) return { ok: false, code: 'forbidden', message: '본인 응시가 아닙니다.' };
    if (attempt.status === 'submitted') return { ok: false, code: 'already', message: '이미 제출되었습니다.' };
    if (attempt.status === 'ready') return { ok: false, code: 'not_started', message: '시험을 먼저 시작하세요.' };

    // ⭐ 서버강제 마감 재판정: 트랜잭션 시점의 NOW()가 deadline을 넘었으면 거부 + 만료 처리.
    if (attempt.deadlineAt && Date.now() > attempt.deadlineAt.getTime()) {
      await attemptsRepo.markExpiredTx(client, attempt.id);
      await attemptsRepo.addEventTx(client, attempt.id, 'submit_rejected_expired', {});
      return { ok: false, code: 'expired', message: '제한시간이 지나 제출할 수 없습니다.' };
    }

    // accepted 적재(upload → trust unverified). submission.attempt_id UNIQUE = 1:1 보장.
    const submission = await submissionsRepo.insertSubmissionTx(client, {
      attemptId: attempt.id,
      capturedVia: 'upload',
      trust: 'unverified',
      tool: input.tool ?? v.derived?.tool ?? null,
      chatFormatVersion: CHAT_FORMAT_VERSION,
      status: 'accepted',
    });
    await submissionsRepo.insertFilesTx(client, submission.id, input.files);
    await submissionsRepo.setStatusTx(client, submission.id, 'accepted', null);
    await attemptsRepo.markSubmittedTx(client, attempt.id);
    await attemptsRepo.addEventTx(client, attempt.id, 'submitted', {
      via: 'upload',
      messageCount: v.derived?.messageCount ?? 0,
      files: input.files.length,
    });

    return { ok: true, submissionId: submission.id };
  });
}
