import 'server-only';
import { attemptsRepo, batchesRepo, problemsRepo, slotsRepo, withTransaction } from '../db';
import { BUCKETS } from '../storage';
import { generateVirtualKey, deleteVirtualKeys } from '../litellm/keys';
import {
  inCluster,
  k8sNamespace,
  k8sRequest,
  applyObject,
  deleteObject,
  scaleStatefulSet,
  listNamesByPrefix,
  waitFor,
} from '../k8s/client';
import {
  EXAM_STS,
  paths,
  slotEndpoint,
  examBatchConfigMap,
  virtualKeysSecret,
  slotService,
  slotsIngress,
  packagingJob,
} from '../k8s/examResources';

// examOpsService — 회차 풀 운영(cold path) 오케스트레이션. docs/6 Phase 3의 로컬판(k8s API 직접).
// "회차 열기" 한 번 = 문제 ConfigMap + 가상키 Secret + StatefulSet 0→N + 슬롯별 Service/Ingress + 슬롯 register.
// ⭐ 풀 ≠ 할당: 여기는 pod 개수(회차 단위, 관리자 사건)만 다룬다. 학생 배정은 examService의
//    DB 트랜잭션(SKIP LOCKED)이며 git/k8s API와 무관(docs/2 §5·§6).
// alpha/prod 는 같은 흐름을 catchup-helm 커밋 → ArgoCD sync 로 바꾼다(§5.4) — 이 서비스의 k8s 호출부만 교체.

const MAX_SLOTS = 50;

function requireCluster(): string {
  if (!inCluster()) {
    throw new Error(
      'k8s 클러스터 밖에서 실행 중입니다(ServiceAccount 미탑재). 회차 환경 제어는 k3d 안의 web pod에서만 가능합니다 — ./setup.sh 스택에서 실행하세요.',
    );
  }
  return k8sNamespace();
}

export interface ProvisionResult {
  slots: number;
  problemCode: string;
  scaffoldRef: string;
  warnings: string[];
}

/**
 * 회차 환경 provision: 0→N. 멱등(재실행 시 PVC wipe 후 재시드 = 깨끗한 워크스페이스 보장).
 * 진행 중(assigned/submitting) 슬롯이 있으면 거부 — PVC wipe가 작업물을 파괴하지 않도록.
 */
export async function provisionBatch(batchId: string, n?: number): Promise<ProvisionResult> {
  const ns = requireCluster();
  const warnings: string[] = [];

  // ── 1. 회차·문제 해석 (DB가 정보원) ──
  const batch = await batchesRepo.findById(batchId);
  if (!batch) throw new Error('회차를 찾을 수 없습니다.');
  const version = await problemsRepo.findVersionById(batch.problemVersionId);
  if (!version) throw new Error('회차에 연결된 문제 버전을 찾을 수 없습니다.');
  const slots = Math.min(n ?? batch.capacity, MAX_SLOTS);
  if (slots < 1) throw new Error('슬롯 수는 1 이상이어야 합니다.');

  // ── 2. 가드: 어떤 회차든 학생이 작업/제출 중이면 거부 (단일 StatefulSet 구조의 불변식) ──
  if (await slotsRepo.hasBusySlots()) {
    throw new Error('진행 중(배정/제출 중) 슬롯이 있습니다. 해당 회차를 먼저 종료(close)한 뒤 다시 시도하세요.');
  }

  // ── 3. 깨끗한 풀 재구성: scale 0 → pod 소멸 → 패키징 Job 정리 → PVC wipe(이전 작업물 누수 0) ──
  // ⚠️ 순서 중요: 완료된 패키징 pod도 pvc-protection이 "사용 중"으로 잡아 PVC 삭제를 영원히
  //    막는다(실측: Job pod가 Completed여도 Used By에 남음) → Job을 먼저 지워야 PVC가 풀린다.
  await scaleStatefulSet(ns, EXAM_STS, 0);
  const podsGone = await waitFor(
    async () => (await listNamesByPrefix(paths.pods(ns, 'app=exam'), EXAM_STS)).length === 0,
    120_000,
  );
  if (!podsGone) throw new Error('기존 exam pod 종료 대기 시간 초과(120s). 클러스터 상태를 확인하세요.');
  for (const name of await listNamesByPrefix(paths.jobs(ns), 'pkg-')) {
    await deleteObject(paths.job(ns, name)); // propagation=Background — 완료 pod까지 제거
  }
  const oldPvcs = await listNamesByPrefix(paths.pvcs(ns), `workspace-${EXAM_STS}-`);
  for (const name of oldPvcs) await deleteObject(paths.pvc(ns, name));
  if (oldPvcs.length > 0) {
    const pvcsGone = await waitFor(
      async () => (await listNamesByPrefix(paths.pvcs(ns), `workspace-${EXAM_STS}-`)).length === 0,
      90_000,
    );
    // ⚠️ 하드 실패 — 경고로 넘기면 StatefulSet이 terminating PVC에 막혀 pod 0개인데
    //    슬롯은 ready로 등록되는 "거짓 성공"이 된다(실측). 여기서 끊어야 관리자가 바로 본다.
    if (!pvcsGone) {
      throw new Error(
        '이전 워크스페이스(PVC) 삭제가 완료되지 않았습니다 — PVC를 물고 있는 pod(패키징 Job 등)을 확인한 뒤 다시 시도하세요.',
      );
    }
  }

  // ── 4. 가상키 발급 (슬롯당 1키, 예산 = batches.llm_budget_usd) — 실패 가능 단계(PVC) 뒤로
  //      미뤄 발급 키 누수를 방지. 게이트웨이 불통이면 여기서 실패(아직 아무것도 안 띄움). ──
  const keys: string[] = [];
  for (let i = 0; i < slots; i++) {
    keys.push(
      await generateVirtualKey({
        alias: `catchup-${batchId.slice(0, 8)}-slot-${i}-${Date.now().toString(36)}`,
        maxBudgetUsd: batch.llmBudgetUsd,
      }),
    );
  }

  // ── 5. 회차 문제 ConfigMap + 가상키 Secret (seeder·기동 래퍼가 읽음) → scale N ──
  await applyObject(
    paths.configMap(ns, 'exam-batch'),
    examBatchConfigMap(ns, { batchId, scaffoldRef: version.publicScaffoldRef, problemCode: version.problemCode }),
  );
  await applyObject(paths.secret(ns, 'exam-virtual-keys'), virtualKeysSecret(ns, keys));
  await scaleStatefulSet(ns, EXAM_STS, slots);

  // ── 6. 슬롯별 라우팅: Service(pod 고정) N개 + Ingress(/exam-ide/{i}) — per-student 격리의 실체 ──
  for (let i = 0; i < slots; i++) {
    await applyObject(paths.service(ns, `exam-slot-${i}`), slotService(ns, i));
  }
  // 정원 축소 시 잔여 Service 정리 + 레거시(전 pod 라운드로빈) 경로 제거.
  const staleSvcs = (await listNamesByPrefix(paths.services(ns), 'exam-slot-')).filter(
    (name) => Number(name.replace('exam-slot-', '')) >= slots,
  );
  for (const name of staleSvcs) await deleteObject(paths.service(ns, name));
  await applyObject(paths.ingress(ns, 'exam-ide-slots'), slotsIngress(ns, slots));
  await deleteObject(paths.ingress(ns, 'exam-ide')).catch(() => undefined); // 구판 정적 Ingress
  await deleteObject(paths.service(ns, 'exam-direct')).catch(() => undefined); // 구판 라운드로빈 Service

  // ── 7. 슬롯 register (DB) — endpoint + 가상키. 같은 프로세스이므로 HTTP 우회 없이 repo 직접 ──
  await slotsRepo.resetBatchSlots(batchId);
  await withTransaction(async (client) => {
    for (let i = 0; i < slots; i++) {
      await slotsRepo.registerSlotTx(client, {
        batchId,
        slotNo: i,
        endpoint: slotEndpoint(ns, i),
        virtualKey: keys[i],
      });
    }
  });

  warnings.push('pod 기동·문제 시드에는 수십 초가 걸립니다 — 학생 입장 전 슬롯 상태를 확인하세요.');
  return { slots, problemCode: version.problemCode, scaffoldRef: version.publicScaffoldRef, warnings };
}

export interface CloseResult {
  revokedKeys: number;
  warnings: string[];
}

/**
 * 회차 환경 close: N→0 + 슬롯별 라우팅 제거 + 가상키 revoke + 슬롯 상태머신(전부 down).
 * ⚠️ PVC는 지우지 않는다 — 패키징 누락분 회수·감사 여지를 남기고, 다음 provision이 wipe.
 */
export async function closeBatch(batchId: string): Promise<CloseResult> {
  const ns = requireCluster();
  const warnings: string[] = [];

  const batch = await batchesRepo.findById(batchId);
  if (!batch) throw new Error('회차를 찾을 수 없습니다.');

  // 1. 풀 회수(0) + 슬롯별 라우팅 제거.
  await scaleStatefulSet(ns, EXAM_STS, 0);
  await deleteObject(paths.ingress(ns, 'exam-ide-slots')).catch(() => undefined);
  for (const name of await listNamesByPrefix(paths.services(ns), 'exam-slot-')) {
    await deleteObject(paths.service(ns, name));
  }
  await deleteObject(paths.secret(ns, 'exam-virtual-keys')).catch(() => undefined);

  // 2. 가상키 revoke(게이트웨이) — best-effort. 키 자체도 duration으로 자연 만료된다.
  const slots = await slotsRepo.listByBatch(batchId);
  const keys = slots.map((s) => s.virtualKey).filter((k): k is string => !!k);
  const revokeError = await deleteVirtualKeys(keys);
  if (revokeError) warnings.push(`가상키 revoke 실패(만료는 duration이 보장): ${revokeError}`);

  // 3. 슬롯 상태머신: 이 회차 슬롯 전부 down + 키 해제.
  await slotsRepo.markBatchDown(batchId);

  return { revokedKeys: revokeError ? 0 : keys.length, warnings };
}

export type PackageResult =
  | { ok: true; jobName: string; artifactRef: string; chatRef: string }
  | { ok: false; reason: string };

/**
 * MinIO 객체 키용 슬러그 — 사람이 읽는 경로(한글 보존). 경로구분·공백 → '-',
 * S3 키에서 문제되는 문자만 제거, 길이 상한. uuid 나열 대신 회차/학생이 보이게(운영 가독성).
 */
function keySlug(s: string, max = 60): string {
  const cleaned = s
    .normalize('NFC')
    .replace(/[\u0000-\u001f"'<>#%{}|^~[\]`\\?*&=+;:,@$()!]/g, '')
    .replace(/[/\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return (cleaned || 'unknown').slice(0, max);
}

/**
 * 제출물 패키징 Job 생성(제출/강제제출 직후). fail-soft — 호출부는 실패해도 제출 자체를 막지 않는다.
 * Job: PVC(readOnly)에서 project/(작업물)·claude/(대화 JSONL)를 각각 tar+sha256 → MinIO →
 * internal 콜백이 submission_files(artifact·chat_log) 등록.
 * 키 구조(사람이 읽는 경로): {버킷}/{회차명}/{학생명_이메일로컬-attempt8}/workspace.tgz|chatlog.tgz
 */
export async function packageAttempt(attemptId: string): Promise<PackageResult> {
  if (!inCluster()) return { ok: false, reason: 'k8s 밖 실행(로컬 dev) — 패키징 Job 생략' };
  const ns = k8sNamespace();

  const slot = await slotsRepo.findActiveSlotByAttempt(attemptId);
  if (!slot) return { ok: false, reason: '배정된 슬롯이 없는 응시 — 패키징할 작업물 없음' };

  // 사람이 읽는 키: 회차명/학생명_이메일 — uuid 는 충돌 방지용 8자만 꼬리에.
  const detail = await attemptsRepo.findDetailById(attemptId);
  const batchSlug = keySlug(detail?.batchName ?? 'batch');
  const emailLocal = detail?.examineeEmail?.split('@')[0] ?? '';
  const studentSlug = keySlug(
    [detail?.examineeName, emailLocal].filter(Boolean).join('_') || 'student',
  );
  const dir = `${batchSlug}/${studentSlug}-${attemptId.slice(0, 8)}`;
  const artifactRef = `${BUCKETS.artifacts}/${dir}/workspace.tgz`;
  const chatRef = `${BUCKETS.chatlogs}/${dir}/chatlog.tgz`;

  const jobName = `pkg-${slot.slotNo}-${attemptId.slice(0, 8)}-${Date.now().toString(36)}`;
  const res = await k8sRequest(
    'POST',
    paths.jobs(ns),
    packagingJob(ns, { jobName, slotNo: slot.slotNo, attemptId, artifactRef, chatRef }),
  );
  if (res.status === 409) return { ok: true, jobName, artifactRef, chatRef }; // 동일 Job 존재(재시도 멱등)
  if (res.status < 200 || res.status >= 300) {
    const msg = (res.body as { message?: string } | null)?.message ?? `HTTP ${res.status}`;
    return { ok: false, reason: `패키징 Job 생성 실패: ${msg}` };
  }
  return { ok: true, jobName, artifactRef, chatRef };
}
