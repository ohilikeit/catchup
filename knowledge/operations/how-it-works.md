---
type: Architecture Overview
title: 회차별 시험 환경 동작 원리
description: 학생 개개인에게 격리된 코딩 컨테이너를 할당·운영·회수하는 전체 메커니즘.
resource: file:///docs/0-how-it-works.md
tags: [exam, k8s, statefulset, slots, litellm, hot-path, cold-path]
timestamp: 2026-06-17T00:00:00Z
---

# 회차별 시험 환경 동작 원리

## 핵심 설계 명제

| # | 명제 | 근거 |
|---|---|---|
| 1 | **상태의 정답지는 DB** — 슬롯 배정·마감·소유권은 Postgres 제약이 강제 | `hosted.slots` (`attempt_id UNIQUE`, `(batch_id,slot_no)` PK) |
| 2 | **Hot path / Cold path 분리** — 학생 배정은 DB 트랜잭션 1회, 규모 변경만 k8s API | `startExam` (tx) vs `provisionBatch` (k8s) |
| 3 | **per-student 격리는 StatefulSet ordinal로 고정** — Service가 라운드로빈하지 않음 | `statefulset.kubernetes.io/pod-name` selector |
| 4 | **클라이언트 불신** — 마감 재판정·작업물 캡처는 서버가 수행 | `autoCollectAttempt`, packaging Job (PVC readOnly) |

## 전체 구조

k3s 클러스터(`namespace: catchup-*`) 안에서:

- **web Deployment (Next.js)**: route handlers → `lib/services` → `lib/k8s/client`
- **exam StatefulSet** (replicas 0↔N, 최대 50): 각 pod = code-server + Claude Code, PVC 1개씩
- **LiteLLM Gateway**: 모델 고정·가상키·예산·로깅. 학생 pod은 이 게이트웨이로만 Anthropic에 도달
- **PostgreSQL**: 정보원 (auth·exam·hosted schema)
- **Redis**: 캐시 + fail-soft
- **MinIO**: scaffold·artifacts·chatlogs

egress 차단: 학생 pod은 NetworkPolicy로 외부망 차단, litellm + DNS만 허용.

## API 흐름 ① — 시험 시작 (Hot Path)

`examService.startExam(attemptId, examineeId)`:

1. `findRuntimeForExaminee` — 소유권·상태 확인. submitted/expired면 즉시 거부
2. 원자 트랜잭션:
   - `startRunningTx` → `status=running`, `deadline_at` 서버 설정
   - `findSlotByAttemptTx` — 재시작 멱등 확인
   - ready 슬롯 있으면 `assignReadySlotTx` (`UPDATE … FOR UPDATE SKIP LOCKED LIMIT 1`)
   - 없으면 `enqueueTx` (entry_queue FIFO)
   - `addEventTx('started', …)`
3. 커밋 후 `reconcilePool(batchId)` 비동기 실행 (fail-soft)
4. 이후 매 IDE 요청은 Traefik ForwardAuth → `/api/internal/exam-authz`로 세션 유효 + 경로 slotNo == 배정 slotNo 검사

## API 흐름 ② — 제출 & 패키징 (Cold Path)

트리거: 학생 제출 / 만료(`expireExam`) / 회차 종료 스윕(`sweepDeadlines`)

1. DB lock → `status=submitted`, `slot.state=submitting`
2. `addEventTx('submitted' | 'auto_collected')`
3. k8s packaging Job 생성: PVC readOnly 마운트 → tar + sha256 → MinIO 업로드
4. Job 완료 콜백 → `/api/internal/submissions/package` → DB submission accepted

**불변 순서**: 취합(패키징) 완료 전에 PVC를 지우지 않는다. `closeBatch`도 sweep → scale-down 순서.

## 슬롯 상태 머신

`hosted.slots.state` (마이그레이션: `0008_slot_window_states.sql`):

```
down → warming → ready → assigned → submitting → recycling → ready
                                                              (재활용)
```

- `down`: 등록됨, pod 미기동
- `warming`: Pod 스케줄됨
- `ready`: heartbeat OK (Pod Ready) — 배정 가능
- `assigned`: `assignReadySlotTx` (SKIP LOCKED)
- `submitting`: 제출/auto-collect 트리거
- `recycling`: packaging Job 완료 후 PVC wipe+재시드
- `ready`: 풀 반납

## 회차 생명주기

### provisionBatch (0→N)
busy 슬롯 가드 → scale 0 + 이전 Job/PVC wipe(PVC 삭제 완료 대기) → **가상키 1개 발급(회차 공유, `alias=catchup-<batchId>-<ts>`, `max_budget=llm_budget_usd`)** → ConfigMap/Secret apply(모든 슬롯에 동일 키 주입) → warm_count만큼 scale up → 슬롯별 Service(`exam-slot-{N}`) + Ingress(`exam-ide-slots`) apply → slots 등록(state=`down`, DB)

> 코드 확인(`apps/web/lib/services/examOpsService.ts` `provisionBatch`): `keys = new Array(slots).fill(batchKey)` — 슬롯별 개별 키 발급이 아니라 동일 키를 배열에 채워 Secret에 주입. `warmOverride ?? batch.warmCount ?? slots`로 fallback(NULL이면 capacity 전수 기동).

### reconcilePool (advisory lock, 요청 유도형)
Pod Ready↔slot ready 동기화 → entry_queue FIFO 배정 → `desired = min(50, max(warm, used+waiting))`, current<desired이면 scale up

### closeBatch (N→0)
sweepDeadlines 먼저 → scale 0 + 슬롯별 Service/Ingress/Secret 삭제(best-effort, k8s 실패 시 경고만) → **가상키 block**(`/key/block`, 삭제 아님 — 비용 대시보드 보존 목적) → slots down + virtual_key=NULL, entry_queue clear. PVC는 보존(다음 provision의 wipe가 처리).

> 코드 확인(`apps/web/lib/services/examOpsService.ts` `closeBatch`): teardown은 best-effort — k8s 실패가 slots down을 건너뛰지 않도록 try-catch 분리. `markBatchDown`은 teardown 성공 여부와 무관하게 항상 실행(provision 가드 해제).

**warm_count 정책** (`0013`): NULL=정원 전수, 값 지정 시 그 수만 선기동, 초과 수요는 실수요만큼 scale up.

**스케일 경로**:
- local(k3d): web Pod이 in-cluster SA 토큰으로 `scaleStatefulSet` 직접 호출
- alpha/prod: `catchup-helm/batches/current.yaml`에 replicas 커밋 → ArgoCD auto-sync

## 자원 통제

| 축 | 상한 | 위치 |
|---|---|---|
| 컴퓨트 | requests 500m/2Gi · limits 2cpu/4Gi | exam StatefulSet container |
| 스토리지 | PVC 2Gi/슬롯 (로컬 k3d `40-exam.yaml` 실측값) | volumeClaimTemplates |
| 동시성 | 슬롯 ≤ 50 / StatefulSet | `Math.min(capacity, 50)` |
| AI 예산 | 가상키별 `max_budget_usd` | LiteLLM `/key/generate` |
| 모델 | claude-sonnet-4-6 강제 | `infra/litellm/config.yaml` |
| 네트워크 | egress = litellm + DNS only | NetworkPolicy |

# Examples

동시 5명 시작 버튼 클릭: `FOR UPDATE SKIP LOCKED`가 5개 서로 다른 슬롯을 보장. 이중 배정은 슬롯 PK `(batch_id, slot_no)` + 트랜잭션이 물리적으로 차단.

# Citations

- 원본: `docs/0-how-it-works.md`
- 슬롯 상태 마이그레이션: `db/migrations/0008_slot_window_states.sql`
- Hot path: `apps/web/lib/services/examService.ts`
- Cold path: `apps/web/lib/services/examOpsService.ts`
- 슬롯/대기열 repo: `apps/web/lib/db/repositories/slots.ts`, `entryQueue.ts`
- k8s 클라이언트: `apps/web/lib/k8s/client.ts`
- 동적 매니페스트: `apps/web/lib/k8s/examResources.ts`
- 관련: [exam-environment](/operations/exam-environment.md), [exam-serving](/operations/exam-serving.md), [storage-submission-pipeline](/operations/storage-submission-pipeline.md)
- DB 스키마 결정: [platform master checklist](/platform/master-checklist.md)
