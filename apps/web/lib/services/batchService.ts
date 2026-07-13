import 'server-only';
import { withTransaction } from '../db';
import * as batchesRepo from '../db/repositories/batches';
import * as usersRepo from '../db/repositories/users';
import * as attemptsRepo from '../db/repositories/attempts';
import * as rosterRepo from '../db/repositories/roster';
import { cacheService, TTL } from '../cache';
import { hashPassword, genTempPassword } from '../auth/password';
import type { Session } from '../auth/session';
import { myOrgAdminIds } from '../auth/guard';
import type { BatchListItem } from '../db/repositories/batches';
import { listAllowedModels, assertModelAllowed } from '../litellm/models';

// batchService — 회차 목록(스코프)·개설·로스터 import. route는 얇게, 스코프/트랜잭션은 여기서.
// 캐시: 회차 현황은 실시간성 중요 → 짧은 TTL(BATCH_STATUS=30s), 쓰기 후 invalidate(reference/03 §4).

const KEY_ALL = 'batches:all';
const keyOrg = (ids: string[]) => `batches:org:${[...ids].sort().join(',')}`;

/** viewer 기준 회차 목록. admin=전체 / org_admin=자기 대학만(org 스코프 강제). */
export async function listForViewer(session: Session): Promise<BatchListItem[]> {
  if (session.globalRoles.includes('admin')) {
    return cacheService.getOrSet(KEY_ALL, () => batchesRepo.listAll(), TTL.BATCH_STATUS);
  }
  const orgIds = myOrgAdminIds(session);
  if (orgIds.length === 0) return [];
  return cacheService.getOrSet(keyOrg(orgIds), () => batchesRepo.listByOrgIds(orgIds), TTL.BATCH_STATUS);
}

async function invalidateBatchLists(): Promise<void> {
  await cacheService.invalidate('batches:*');
}

/**
 * 회차 상세 + 로스터(viewer 스코프). admin=전체, org_admin=자기 대학만(아니면 null=404).
 * canOperate: 운영 액션(상태전이·연장·무효) 가능 여부(admin만).
 */
export async function getBatchDetailForViewer(session: Session, batchId: string): Promise<{
  detail: BatchListItem;
  roster: attemptsRepo.RosterItem[];
  canOperate: boolean;
} | null> {
  const detail = await batchesRepo.findDetailById(batchId);
  if (!detail) return null;
  const isAdmin = session.globalRoles.includes('admin');
  if (!isAdmin && !myOrgAdminIds(session).includes(detail.orgId)) return null; // org 스코프
  const roster = await attemptsRepo.listRosterByBatch(batchId);
  return { detail, roster, canOperate: isAdmin };
}

export async function createBatch(input: {
  orgId: string;
  name: string;
  /** 출제 문제 버전 ID들(seq 1..N). [0]=대표 문제. 최소 1개. */
  problemVersionIds: string[];
  capacity?: number;
  scheduledAt?: Date | null;
  /** 회차 AI 모델(litellm model_name). 미지정=allowlist[0](기본). docs/11. */
  model?: string;
  llmBudgetUsd?: number | null;
  /** 워밍 풀: 미리 띄울 pod 수. 미지정=정원의 20%(라이브 입장 기본). docs/6 Phase 3. */
  warmCount?: number | null;
  /** 회차 학생당 허용 프롬프트(turn) 수. 미지정=30. 음수는 0으로 보정. docs/batch-prompt-quota. */
  promptQuota?: number;
}) {
  const cap = input.capacity ?? 50;
  // 워밍 풀 기본 정책: warm 미지정(빈 칸)이면 정원의 20%만 미리 띄우고 나머지는 도착 시 보충(B).
  // 명시값은 그대로 존중 — 0=전부 cold, cap=일괄(A). NULL을 "전부"로 두던 과거 기본을 뒤집는다.
  const warmCount = input.warmCount ?? Math.max(1, Math.round(cap * 0.2));
  // 서버 검증(클라 입력은 적대적): 0 ≤ warm ≤ capacity 정수.
  if (!Number.isInteger(warmCount) || warmCount < 0 || warmCount > cap) {
    throw new Error(`워밍 pod 수는 0~정원(${cap}) 사이의 정수여야 합니다.`);
  }
  // 모델 해석: 미지정이면 allowlist[0](기본), 지정이면 서버측 재검증(대원칙 5⑤).
  let model: string;
  if (input.model) {
    await assertModelAllowed(input.model);
    model = input.model;
  } else {
    const allowed = await listAllowedModels();
    const first = allowed[0];
    if (!first) throw new Error('허용된 모델이 없습니다(게이트웨이 설정을 확인하세요).');
    model = first;
  }
  // 쿼터: 미지정이면 30, 음수는 0으로 보정(DB CHECK >= 0 의 선행 방어).
  const promptQuota = Math.max(0, Math.round(input.promptQuota ?? 30));

  // 문제 목록: 순서 보존 중복 제거. 최소 1개(서버 검증 — 클라 입력은 적대적). [0]=대표.
  const problemVersionIds = [...new Set(input.problemVersionIds)].filter(Boolean);
  if (problemVersionIds.length === 0) throw new Error('출제할 문제를 최소 1개 선택하세요.');

  // batch(대표 문제) + batch_problems(전체 seq 순)를 한 트랜잭션으로(불변식: seq=1 = 대표).
  const batch = await withTransaction(async (client) => {
    const created = await batchesRepo.createTx(client, {
      orgId: input.orgId,
      name: input.name,
      problemVersionId: problemVersionIds[0]!,
      capacity: input.capacity,
      scheduledAt: input.scheduledAt,
      model,
      llmBudgetUsd: input.llmBudgetUsd,
      warmCount,
      promptQuota,
    });
    await batchesRepo.addBatchProblemsTx(client, created.id, problemVersionIds);
    return created;
  });
  await invalidateBatchLists();
  return batch;
}

/** 회차 모델 변경 — allowlist 재검증 후 영속(provision 재확인 시). */
export async function updateBatchModel(batchId: string, model: string): Promise<void> {
  await assertModelAllowed(model);
  await batchesRepo.updateModel(batchId, model);
}

/** 회차 프롬프트 쿼터 변경 — 음수 보정 후 영속. */
export async function updateBatchPromptQuota(batchId: string, quota: number): Promise<void> {
  const sanitized = Math.max(0, Math.round(quota));
  await batchesRepo.updatePromptQuota(batchId, sanitized);
}

export async function setBatchStatus(id: string, status: batchesRepo.BatchStatus) {
  const batch = await batchesRepo.setStatus(id, status);
  await invalidateBatchLists();
  return batch;
}

export interface DeleteResult {
  ok: boolean;
  error?: string;
}

/**
 * 회차 하드 삭제 — ⭐ "scheduled + 응시 0"일 때만(이력 보존 불변식).
 * 이력 있는 회차는 삭제 대신 취소(cancelled)로 내린다 — RESTRICT가 DB에서도 막지만, 여기서 먼저
 * 우아하게 거부해 운영자에게 이유를 알린다. scheduled = provision 전이라 정리할 k8s 리소스도 없다.
 * (slots·roster_imports·entry_queue는 CASCADE로 함께 삭제 — 다음 회차 운영의 잔재 없음.)
 */
export async function deleteBatch(batchId: string): Promise<DeleteResult> {
  const detail = await batchesRepo.findDetailById(batchId);
  if (!detail) return { ok: false, error: '회차를 찾을 수 없습니다.' };
  if (detail.status !== 'scheduled') {
    return { ok: false, error: '아직 시작하지 않은(scheduled) 회차만 삭제할 수 있습니다. 진행/종료된 회차는 "취소"로 내려주세요.' };
  }
  if (detail.attemptCount > 0) {
    return { ok: false, error: `응시자 ${detail.attemptCount}명이 등록돼 삭제할 수 없습니다. 로스터를 비우거나 회차를 취소하세요.` };
  }
  await batchesRepo.deleteBatch(batchId);
  await invalidateBatchLists();
  return { ok: true };
}

/* ── 로스터 CSV import(멱등·재실행 가능, docs/1 §4) ─────────────────────── */

export interface RosterRow {
  name: string;
  email: string;
  externalId?: string | null;
}

/** 신규 발급된 계정의 전달용 자격증명(평문 임시비번은 여기서만, 1회). */
export interface IssuedCredential {
  name: string;
  email: string;
  externalId: string | null;
  tempPassword: string;
}

export interface ImportSummary {
  created: number;
  skipped: number;
  errors: number;
  importId: string;
  /** ⭐ 신규 계정의 (이메일, 임시비번) — 학생 전달용. 평문은 이 응답에만 존재, 재조회 불가. */
  issued: IssuedCredential[];
}

/**
 * 로스터 행 배열 → users + org_members(examinee) + attempts 멱등 생성. 전부 한 트랜잭션.
 * ⭐ 신규 계정은 임시비번을 생성해 bcrypt 해시로 저장하고, 평문을 issued[]로 1회 반환(전달용).
 * 기존 계정은 비번을 건드리지 않고 회차 attempt만 추가(다회차 참여 — 같은 계정에 누적).
 * 행 단위 결과는 ops.roster_import_rows에 기록(무엇이 왜 실패했는지 추적).
 */
export async function importRoster(input: {
  batchId: string;
  orgId: string;
  rows: RosterRow[];
  createdBy: string | null;
}): Promise<ImportSummary> {
  const summary = await withTransaction(async (client) => {
    const importId = await rosterRepo.createImportTx(client, input.batchId, input.createdBy);
    let created = 0;
    let skipped = 0;
    let errors = 0;
    const issued: IssuedCredential[] = [];

    for (const row of input.rows) {
      const email = (row.email ?? '').trim().toLowerCase();
      const name = (row.name ?? '').trim();
      const rawRow = row as unknown as Record<string, unknown>;
      if (!email || !name) {
        errors++;
        await rosterRepo.addImportRowTx(client, importId, rawRow, 'error', '이름/이메일 누락');
        continue;
      }
      try {
        // 신규 계정에만 줄 임시비번을 미리 준비(생성된 경우에만 사용).
        const tempPassword = genTempPassword();
        const passwordHash = await hashPassword(tempPassword);
        const { userId, created: userCreated } = await usersRepo.upsertByEmailTx(client, {
          email,
          fullName: name,
          passwordHash,
          tempPassword, // 신규 계정에 한해 평문 보관(관리자 조회·전달용); 학생 비번 변경 시 NULL
        });
        await usersRepo.addExamineeMembershipTx(client, {
          orgId: input.orgId,
          userId,
          externalId: row.externalId ?? null,
        });
        const attemptCreated = await attemptsRepo.ensureAttemptTx(client, {
          batchId: input.batchId,
          examineeId: userId,
        });
        // 신규 계정이면 전달용 자격증명 노출(평문 1회).
        if (userCreated) {
          issued.push({ name, email, externalId: row.externalId ?? null, tempPassword });
        }
        if (attemptCreated) {
          created++;
          await rosterRepo.addImportRowTx(client, importId, rawRow, 'created', null);
        } else {
          skipped++;
          await rosterRepo.addImportRowTx(client, importId, rawRow, 'skipped', '이미 응시 존재');
        }
      } catch (e) {
        errors++;
        await rosterRepo.addImportRowTx(client, importId, rawRow, 'error', String((e as Error).message));
      }
    }

    await rosterRepo.finishImportTx(client, importId, 'completed', { created, skipped, errors });
    return { created, skipped, errors, importId, issued };
  });

  await invalidateBatchLists();
  return summary;
}
