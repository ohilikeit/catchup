---
type: Operations Runbook
title: 시험 서빙 아키텍처 — 운영팀 공유용 한 장 개요
description: 동시 50명 시험 환경이 어떻게 떠 있고, 접속되고, 장애 시 복구되는지 운영/시스템팀 시각으로 정리.
resource: file:///docs/4-exam-serving-overview.md
tags: [exam, serving, statefulset, failover, dashboard, health]
timestamp: 2026-06-17T00:00:00Z
---

# 시험 서빙 아키텍처 — 운영팀 공유용

> ⚠️ 이 문서는 **동시 50명 버스트(A)** 그림으로 설명. 설계 기본 엔진은 **비동기 창(B)**이고 A는 그 특수 케이스.

## 핵심 한 줄

학생마다 "지정 사물함"(StatefulSet pod 50개, 번호 고정). 슬롯별 고정 Service N개(라운드로빈 없음, `statefulset.kubernetes.io/pod-name` selector로 pod 1개만 지정) + 통합 Ingress 1개(`/exam-ide/{N}` 경로분기). 학생 pod은 인터넷에 직접 안 뜨고, Traefik ForwardAuth → code-server 직결로 접근. AI는 LiteLLM 게이트웨이 1개를 공유. 장애는 pod 단위로 격리.

> ⚠️ 구현 현황(2026-06): provision 시 `exam-slot-{N}` Service N개와 `exam-ide-slots` Ingress 1개를 동적 생성(`apps/web/lib/k8s/examResources.ts` `slotService`, `slotsIngress`). "Service 1개" 표현은 초안의 headless DNS 참조이며, 실제 라우팅은 슬롯별 개별 Service를 통한다.

## 왜 StatefulSet인가

| 방식 | 비유 | 우리 |
|---|---|---|
| Deployment + 일반 Service | **콜센터** — 아무 상담원이나 받음(로드밸런싱) | ❌ |
| **StatefulSet + headless Service** | **지정 사물함** — 학생마다 자기 번호, 반드시 자기 것 | ✅ |

콜센터식이면 학생 A가 새로고침했을 때 B의 pod로 붙어 남의 코드가 보일 수 있음 → 번호 고정 사물함(StatefulSet) 필수.

## 전체 구성

```
인터넷에 노출되는 건 앱 하나
  ▼
[ 앱 web (Ingress) ]
  │  1) 로그인·인증
  │  2) DB 조회: "A → exam-7"
  │  3) iframe 역프록시(websocket 통과)
  ▼
exam StatefulSet (0↔50)
  exam-0  exam-1  [exam-7] (A의 사물함)  …  exam-49
   │PVC    │PVC         │PVC                     │PVC  ← 작업물 보존
   └── code-server + claude code, 자원상한(2cpu/3Gi), non-root

                  │ ANTHROPIC_BASE_URL=http://litellm:4000
                  ▼
LiteLLM ×2  ──진짜 키(Secret)──→ api.anthropic.com
postgres (앱 + litellm)   redis (앱캐시 + litellm rate 공유)
```

| | 개수 | 수명 | 외부 노출 |
|---|---|---|---|
| 앱 web (Ingress) | 1 | 상주 | ✅ 유일 |
| LiteLLM 게이트웨이 | 1(+replica 2) | 상주 | ❌ 내부 |
| postgres / redis | 각 1 | 상주 | ❌ 내부 |
| **학생 pod** | **최대 50** | **시험 창에만 (0↔N)** | ❌ 내부(ForwardAuth 직결) |
| exam headless Service | 1 (StatefulSet DNS용) | 상주 | ❌ 내부 |
| 슬롯별 Service (`exam-slot-{N}`) | provision 시 N개 동적 생성 | 시험 창에만 | ❌ 내부 |
| IDE Ingress (`exam-ide-slots`) | 1 (동적 생성, `/exam-ide/{N}` 경로분기) | 시험 창에만 | ❌ 내부 |

## 접속이 "그 학생만" 되는 이유

```
1. 학생 A 로그인          → 앱이 신원 확인
2. 앱: attempt #42 → 슬롯 exam-7  (DB 매핑)
3. 앱이 exam-7 로만 iframe 프록시  (websocket 포함)
4. 학생 B가 exam-7 URL을 알아도 → 앱을 안 거치면 도달 불가 (pod 외부 비노출)
```

- **계정 통제 = 앱** (로그인·매핑·프록시). k8s가 계정을 아는 게 아님
- **k8s NetworkPolicy = 보조 자물쇠** (pod간·외부 통신 차단)
- 학생 pod은 ClusterIP/headless → 인터넷에서 직접 못 열림

## 장애 복구 (pod 단위 격리)

| 장애 | 복구 |
|---|---|
| **학생 pod 1개 crash** | k8s 자동 재시작 → 같은 PVC 재부착 → 작업물 그대로. 다른 49명 영향 0 |
| **노드 1대 장애** | 그 노드의 pod만 다른 노드로 재스케줄 (⚠️ PVC RWO 노드 묶임 주의) |
| **LiteLLM 1 replica 죽음** | Service가 남은 replica로 라우팅. rate 상태는 redis 공유 → 무중단 |
| **게이트웨이 전체 불가** | AI만 불가, IDE는 살아있음. 키/Tier 문제면 Anthropic 콘솔에서 조치 |
| **배포·슬롯 전체 실패** | 운영자가 회차 일정 조정·재공지. ArgoCD 재sync로 회복 |
| **시험 종료** | 취합 완료 확인 후 replicas 50→0. PVC 잔존, 평시 자원 0 |

핵심: **한 곳이 죽어도 전체가 안 죽는다.** pod 단위 격리 + PVC 작업물 보존 + 서버 강제 마감.

## 디버깅 빠른 참조

| 증상 | 어디를 보나 | 명령 |
|---|---|---|
| 학생 A만 접속 안 됨 | A의 슬롯 매핑 + 그 pod | 앱 로그 → `kubectl -n exam logs exam-7` |
| 학생 pod 안 뜸/재시작 반복 | pod 상태·이벤트 | `kubectl -n exam describe pod exam-7` |
| 특정 학생 IDE 느림 | 그 pod 자원 | `kubectl -n exam top pod exam-7` (limit 근처면 throttle) |
| AI 응답 안 옴 | 게이트웨이·키·rate | `kubectl -n exam logs deploy/litellm` / LiteLLM `/key/info` |
| 전체적으로 느림/429 | Anthropic rate limit | Console Usage 차트 (ITPM/OTPM), 캐시율 |

컨테이너 직접 진입: `kubectl -n exam exec -it exam-7 -- bash`

고정 번호 덕분에 "학생 A 문제 = exam-7"로 1:1 추적 가능 (콜센터식이면 어느 pod였는지부터 추적해야 함).

## 관리자 대시보드 — 준비·관제·운영 액션

운영자가 클러스터·DB에 직접 접속하지 않고 시험을 준비·관제하는 단일 화면 (`admin/batches/[id]`).

**준비**: 문제 업로드(MinIO) · 회차 생성 · 로스터 배정 · 일정(`deadline_at`) · 모델·예산

"회차 열기"의 실체 = **로컬(k3d): exam-ops가 k8s API를 직접 호출** — ConfigMap·Secret apply + `scaleStatefulSet(warm_count)` + 슬롯별 Service/Ingress 동적 생성 (`apps/web/lib/services/examOpsService.ts` `provisionBatch`). **alpha/prod(미구현)**: `catchup-helm/batches/current.yaml`에 replicas 커밋 → ArgoCD 자동 sync로 교체 예정 (`★GITOPS` 마커 3종 식별 완료, 연결 대기).

**실시간 관제**

| 보는 것 | 출처 |
|---|---|
| 슬롯 ready/active/crash | `hosted.slots` (heartbeat 기준) |
| 학생별 남은시간·재접속 | `attempts.deadline_at` · `attempt_events` |
| 가상키 spend·rate | LiteLLM `/key/info` · Admin UI |
| 제출 현황 | `submissions.status` |

**운영 액션** (모두 서버 API, 학생 화면에 즉시 반영)

| 액션 | 효과 |
|---|---|
| **시간 연장** | `attempts.deadline_at` 갱신 → 학생 상단바 카운트다운 즉시 변경 |
| **강제 제출** | 패키징 Job 트리거 → MinIO+DB |
| **재접속 도움** | 슬롯 매핑 확인 / 세션 리셋 |

## 헬스 3층

| 층 | 보장 | 기준 |
|---|---|---|
| ArgoCD (Synced/Healthy) | 선언한 대로 배포됐나 | 배포 사실 |
| k8s probe (readiness/liveness) | 개별 pod 생존·자동치유 | pod 생존 |
| **앱 heartbeat** | 그 슬롯에 학생을 배정해도 되나 | ⭐ 운영 판단 단일 기준 |

런타임 정상 판정 = ArgoCD가 아니라 **앱 heartbeat** (k8s 직접 접속 없이 앱이 ready 슬롯만 배정).

## 시스템팀 사전 점검 체크리스트

- [ ] 학생 pod 전용 노드 풀 (taint/toleration) + StorageClass (PVC RWO 노드 묶임 — 재스케줄 제약 확인)
- [ ] 사전 워밍 5~10 pod (0→50 부팅 체증 흡수). 평시 replicas=0
- [ ] NetworkPolicy 적용 가능한 CNI (k3s 기본 flannel → 확인 필요)
- [ ] Anthropic Tier 3+ (동시 50, OTPM 병목) + 프롬프트 캐싱 + 가상키 예산상한
- [ ] 시크릿 관리 (진짜 키·master key → SealedSecret/External Secrets)
- [ ] 장애 복구 검증: sync 실패/슬롯 부족 시 재배포·일정조정으로 회복 리허설
- [ ] 취합 순서 불변: 제출/마감 → submission accepted 확정 → **그 다음** scale-down

## 한 문장 정리

번호 고정 사물함(StatefulSet 50) + 입구 하나(Service 1, 앱이 1:1 프록시) + 공용 AI 게이트웨이(LiteLLM 1) — pod 단위 격리로 한 명이 죽어도 전체는 살고, PVC 작업물 보존 + 서버 강제 마감으로 개별 장애가 시험 전체를 멈추지 않는다.

# Citations

- 원본: `docs/4-exam-serving-overview.md`
- 상세 설계: [exam-environment](/operations/exam-environment.md)
- 매니페스트 초안: [k8s-skeleton](/operations/k8s-skeleton.md)
- 스토리지/제출: [storage-submission-pipeline](/operations/storage-submission-pipeline.md)
- 관리자 대시보드 코드: `apps/web/app/(app)/admin/batches/[id]/BatchOpsPanel.tsx`
- 슬롯 상태: `apps/web/lib/db/repositories/slots.ts`
- 가상키 spend: `apps/web/lib/litellm/keys.ts`
