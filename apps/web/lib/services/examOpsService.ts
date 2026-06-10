import 'server-only';
import { attemptsRepo, batchesRepo, entryQueueRepo, problemsRepo, slotsRepo, withTransaction, getPool } from '../db';
import { DEFAULT_DURATION_MIN, sweepDeadlines } from './examService';
import { BUCKETS } from '../storage';
import { generateVirtualKey, deleteVirtualKeys, getKeyInfo } from '../litellm/keys';
import type { SlotState } from '../db/repositories/slots';
import {
  inCluster,
  k8sNamespace,
  k8sRequest,
  applyObject,
  deleteObject,
  getObject,
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
//
// ⚠️ [GitOps 전환 지점 — alpha/prod] 로컬은 k8s API 직접 호출(아래 ★GITOPS 마커 지점):
//   ① provision/reconcile 의 scaleStatefulSet(replicas)     → catchup-helm/batches/current.yaml 의 replicas 커밋
//   ② provision 의 ConfigMap/Secret applyObject              → values/batch overlay 커밋
//   ③ close 의 scale 0 + 라우팅 deleteObject                 → current.yaml replicas:0 커밋
//   교체 범위는 "회차 단위 사건"뿐(hot path 슬롯 배정은 DB라 불변). alpha 작업 시 이 호출들을
//   gitTrigger 전략 뒤로 추출한다(지금은 과설계 금지·대원칙 ③ — 실 파이프라인 검증 전엔 추상화 보류). §5.4.

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
  /** 풀 크기(선준비된 슬롯·키·라우팅 수) = capacity. */
  slots: number;
  /** 시작 시 미리 띄운 pod 수(warm_count, NULL=전부). */
  warm: number;
  problemCode: string;
  scaffoldRef: string;
  warnings: string[];
}

/**
 * 회차 환경 provision — 워밍 풀 모델(docs/6 Phase 3): **선준비는 capacity만큼, 기동은 warm만큼**.
 * 가상키·슬롯별 Service/Ingress·슬롯 row는 슬롯 "번호"에 붙으므로 전부 선생성 가능 —
 * 학생 초과 도착 시 cold 성장이 `scale +Δ` 한 줄이 된다(reconcilePool).
 * 멱등(재실행 시 PVC wipe 후 재시드). 진행 중(assigned/submitting) 슬롯이 있으면 거부.
 * @param warmOverride CLI 검증용 warm 덮어쓰기(exam-ops.sh provision N) — 기본은 batches.warm_count.
 */
export async function provisionBatch(batchId: string, warmOverride?: number): Promise<ProvisionResult> {
  const ns = requireCluster();
  const warnings: string[] = [];

  // ── 1. 회차·문제 해석 (DB가 정보원) ──
  const batch = await batchesRepo.findById(batchId);
  if (!batch) throw new Error('회차를 찾을 수 없습니다.');
  const version = await problemsRepo.findVersionById(batch.problemVersionId);
  if (!version) throw new Error('회차에 연결된 문제 버전을 찾을 수 없습니다.');
  const slots = Math.min(batch.capacity, MAX_SLOTS);
  if (slots < 1) throw new Error('슬롯 수는 1 이상이어야 합니다.');
  const warm = Math.min(slots, Math.max(0, warmOverride ?? batch.warmCount ?? slots));

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

  // ── 5. 회차 문제 ConfigMap + 가상키 Secret (seeder·기동 래퍼가 읽음) → ⭐ replicas는 warm만 ──
  await applyObject(
    paths.configMap(ns, 'exam-batch'),
    examBatchConfigMap(ns, { batchId, scaffoldRef: version.publicScaffoldRef, problemCode: version.problemCode }),
  );
  await applyObject(paths.secret(ns, 'exam-virtual-keys'), virtualKeysSecret(ns, keys)); // ★GITOPS②
  await scaleStatefulSet(ns, EXAM_STS, warm); // ★GITOPS① replicas 커밋으로 교체(alpha+)

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

  // ── 7. 슬롯 register (DB) — capacity 전부, state='down'. pod이 실제 Ready가 되면
  //      reconcilePool이 ready로 전이(거짓 ready 0 — pod 없는 슬롯에 배정되는 일 없음). ──
  await slotsRepo.resetBatchSlots(batchId);
  await withTransaction(async (client) => {
    for (let i = 0; i < slots; i++) {
      await slotsRepo.registerSlotTx(client, {
        batchId,
        slotNo: i,
        endpoint: slotEndpoint(ns, i),
        virtualKey: keys[i],
        state: 'down',
      });
    }
  });

  warnings.push(
    `워밍 ${warm}/${slots} pod 기동 중 — Ready가 되면 자동으로 배정 가능해집니다(학생 화면이 대기→자동 진입).`,
  );
  return { slots, warm, problemCode: version.problemCode, scaffoldRef: version.publicScaffoldRef, warnings };
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

  // 0. ⭐ 취합 먼저: 마감 지난 미제출 응시를 전수 회수(패키징 Job 생성). scale-down 전에 해야
  //    PVC가 살아 있는 동안 캡처된다(docs/5 §5 "취합 먼저, 폐기 나중"). Job은 PVC만 마운트 →
  //    바로 뒤 scale 0 으로 exam pod이 죽어도 독립 실행되고, PVC는 close가 안 지운다(다음 provision wipe).
  try {
    const swept = await sweepDeadlines(batchId);
    if (swept > 0) warnings.push(`마감 경과 미제출 ${swept}건을 자동 회수(패키징)했습니다.`);
  } catch (e: unknown) {
    warnings.push(`마감 자동 회수 일부 실패(close는 계속): ${e instanceof Error ? e.message : e}`);
  }

  // 1. 풀 회수(0) + 슬롯별 라우팅 제거.
  await scaleStatefulSet(ns, EXAM_STS, 0); // ★GITOPS③ current.yaml replicas:0 커밋으로 교체(alpha+)
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

  // 3. 슬롯 상태머신: 이 회차 슬롯 전부 down + 키 해제 + 입장 대기열 정리.
  await slotsRepo.markBatchDown(batchId);
  await entryQueueRepo.clearBatch(batchId);

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

/* ── 워밍 풀 reconcile — 라이브 입장의 엔진(docs/6 Phase 3 워밍 풀 통합 모델) ──────
 * 요청 유도형: 대기 화면의 상태 폴링(slot-status)·시작 직후에 호출된다. 별도 데몬 없음.
 * advisory lock으로 동시 1개만 실행(폴링 stampede 무해화). 전부 멱등.
 *   ① pod Ready ↔ 슬롯 상태 동기화   ② 입장 큐 head부터 FIFO 배정   ③ 부족분 scale +Δ
 * ⭐ scale "down"은 여기서 절대 안 한다 — 회수는 close 소관(작업물 보존 불변식). */

const RECONCILE_LOCK_KEY = 915013;

interface ExamPod {
  ordinal: number;
  ready: boolean;
}

async function listExamPods(ns: string): Promise<ExamPod[]> {
  const body = (await getObject(paths.pods(ns, 'app=exam'))) as {
    items?: Array<{
      metadata?: { name?: string };
      status?: { conditions?: Array<{ type?: string; status?: string }> };
    }>;
  } | null;
  if (!body?.items) return [];
  return body.items
    .map((p) => {
      const name = p.metadata?.name ?? '';
      const ordinal = Number(name.replace(`${EXAM_STS}-`, ''));
      const ready = !!p.status?.conditions?.some((c) => c.type === 'Ready' && c.status === 'True');
      return { ordinal, ready };
    })
    .filter((p) => Number.isInteger(p.ordinal));
}

async function getStsReplicas(ns: string): Promise<number> {
  const body = (await getObject(`/apis/apps/v1/namespaces/${ns}/statefulsets/${EXAM_STS}`)) as {
    spec?: { replicas?: number };
  } | null;
  return body?.spec?.replicas ?? 0;
}

/**
 * 풀 상태를 실제와 일치시키고 대기열을 소진한다(fail-soft — 호출부 흐름을 막지 않음).
 * 큐에서 배정되는 학생의 deadline은 "배정 시점"으로 재설정 — 줄 서서 기다린 시간이
 * 제한시간을 깎지 않게(공정성).
 */
export async function reconcilePool(batchId: string): Promise<void> {
  if (!inCluster()) return;
  const client = await getPool().connect();
  try {
    const lock = await client.query<{ ok: boolean }>(
      `SELECT pg_try_advisory_lock($1) AS ok`,
      [RECONCILE_LOCK_KEY],
    );
    if (!lock.rows[0]?.ok) return; // 다른 요청이 reconcile 중 — 이번 폴링은 통과

    const batch = await batchesRepo.findById(batchId);
    if (!batch || batch.status !== 'open') return;
    const ns = k8sNamespace();
    const poolSize = Math.min(batch.capacity, MAX_SLOTS);

    // ① pod 실상태 → 슬롯 상태 (Ready만 ready로 — 거짓 ready 차단)
    const pods = await listExamPods(ns);
    await slotsRepo.syncReadySlots(batchId, pods.filter((p) => p.ready).map((p) => p.ordinal));

    // ② 입장 큐 FIFO 배정 — head부터, ready 슬롯이 있는 동안
    for (;;) {
      const assigned = await withTransaction(async (tx) => {
        const head = await entryQueueRepo.lockHeadTx(tx, batchId);
        if (!head) return false;
        const slot = await slotsRepo.assignReadySlotTx(tx, batchId, head);
        if (!slot) return false; // ready 없음 — 줄 유지(③이 보충)
        await entryQueueRepo.removeTx(tx, head);
        // 대기 시간이 제한시간을 깎지 않게 배정 시점 기준으로 재산출.
        await attemptsRepo.extendDeadlineTx(tx, head, new Date(Date.now() + DEFAULT_DURATION_MIN * 60_000));
        await attemptsRepo.addEventTx(tx, head, 'slot_assigned_from_queue', { slotNo: slot.slotNo });
        return true;
      });
      if (!assigned) break;
    }

    // ③ 스케일 보충: 사용 중 + 대기 + 워밍 여유(warm_count, NULL=전부)만큼 떠 있게.
    const { used } = await slotsRepo.countPoolUsage(batchId);
    const waiting = await entryQueueRepo.countWaiting(batchId);
    const warmSpare = batch.warmCount ?? poolSize;
    const desired = Math.min(poolSize, used + waiting + warmSpare);
    const current = await getStsReplicas(ns);
    if (desired > current) await scaleStatefulSet(ns, EXAM_STS, desired); // ★GITOPS① cold 성장도 replicas 커밋으로
  } catch (e: unknown) {
    console.error(`[exam-ops] reconcile 실패 batch=${batchId}:`, e instanceof Error ? e.message : e);
  } finally {
    await client.query(`SELECT pg_advisory_unlock($1)`, [RECONCILE_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

export interface PoolSnapshot {
  podsReady: number;
  podsStarting: number;
  replicas: number;
  poolSize: number;
}

/* ── spend·슬롯 관제(대시보드 1d) — LiteLLM /key/info 집계 ─────────────────
 * ⭐ 진짜 키는 노출 안 함(master key 로 spend 숫자만). 키는 슬롯에 선부착(provision)·
 *    close 시 revoke·NULL → open 회차에서만 의미. 게이트웨이는 web 에서 http 로 항상 접근(k8s 무관). */

export interface SlotOpsView {
  slotNo: number;
  state: SlotState;
  /** 이 슬롯 가상키의 누적 사용액(USD). 키 없음/조회 실패 시 null. */
  spendUsd: number | null;
  /** 이 슬롯에 배정된 응시(있으면). */
  attemptId: string | null;
}

export interface BatchOpsSnapshot {
  /** 회차 누적 LLM 사용액(USD) — 조회된 슬롯 합. */
  totalSpendUsd: number;
  /** 1인당 예산 상한(USD). null=상한 없음. */
  perKeyBudgetUsd: number | null;
  /** 게이트웨이 응답이 하나라도 있었는가(전부 실패면 false = 관제 불가 표시). */
  reachable: boolean;
  slots: SlotOpsView[];
}

/**
 * 회차 운영 스냅샷: 슬롯 상태 + 슬롯별/합계 spend. 관리자 상세 화면용(open 회차).
 * 슬롯별 /key/info 를 병렬 조회(로컬 소수 규모 — 50 이하). 키 없는 슬롯은 spend=null.
 */
export async function batchOpsSnapshot(batchId: string): Promise<BatchOpsSnapshot> {
  const slots = await slotsRepo.listByBatch(batchId);
  const infos = await Promise.all(
    slots.map((s) => (s.virtualKey ? getKeyInfo(s.virtualKey) : Promise.resolve(null))),
  );

  let totalSpendUsd = 0;
  let perKeyBudgetUsd: number | null = null;
  let reachable = false;
  const views: SlotOpsView[] = slots.map((s, i) => {
    const info = infos[i];
    if (info) {
      reachable = true;
      totalSpendUsd += info.spend;
      if (info.maxBudget != null) perKeyBudgetUsd = info.maxBudget;
    }
    return { slotNo: s.slotNo, state: s.state, spendUsd: info ? info.spend : null, attemptId: s.attemptId };
  });

  return { totalSpendUsd, perKeyBudgetUsd, reachable, slots: views };
}

/** 대기 화면 표시용 풀 스냅샷(읽기 전용 — reconcile과 무관하게 항상 응답). */
export async function poolSnapshot(batchId: string): Promise<PoolSnapshot | null> {
  if (!inCluster()) return null;
  try {
    const batch = await batchesRepo.findById(batchId);
    if (!batch) return null;
    const ns = k8sNamespace();
    const pods = await listExamPods(ns);
    const replicas = await getStsReplicas(ns);
    return {
      podsReady: pods.filter((p) => p.ready).length,
      podsStarting: pods.filter((p) => !p.ready).length + Math.max(0, replicas - pods.length),
      replicas,
      poolSize: Math.min(batch.capacity, MAX_SLOTS),
    };
  } catch {
    return null;
  }
}
