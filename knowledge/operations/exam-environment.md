---
type: Architecture Overview
title: 시험 환경 — 제공 어댑터 인프라
description: hosted 어댑터의 구현 상세 — 사내망 k3s 위 학생별 격리 컨테이너, LiteLLM 프록시 캡처, GitOps 0↔50 스케일.
resource: file:///docs/2-exam-environment.md
tags: [exam, k8s, code-server, litellm, gitops, seeder, slots, security]
timestamp: 2026-06-17T00:00:00Z
---

# 시험 환경 — 제공 어댑터 인프라

## 핵심 한 줄

hosted 어댑터 = 사내망 k3s 위 학생별 격리 컨테이너(code-server) + LiteLLM 게이트웨이 프록시 캡처, GitOps로 0↔50 스케일(직접 kubectl 없음).
프록시가 대화 전량을 정규화 포맷으로 캡처해 accepted submission을 채운다.

## 단계별 목표 (go/no-go 기준)

| 단계 | 목표 | 통과 기준 | 필요한 것 |
|---|---|---|---|
| **S1 로컬 Docker 스파이크** | 핵심 루프 증명 | 학생 1명: 대화 전량 프록시 저장 → 산출물 회수 → 정규화 submission 1건. `PROBLEM_ID` 교체로 다른 문제 주입 확인 | Docker만 (✅ 완료) |
| **S2 사내망 k3s 스케일 풀** | 동시 50 운영 | 50 동시 리허설: 프로비전→배정→캡처→취합→scale-down | k3s+ArgoCD, 오브젝트 스토리지 |
| **S3 동적 오케스트레이터** | 동시 batch 50 초과 | per-attempt 생성/회수 | ServiceAccount RBAC |

S1 산출물(`experiments/s1-docker-spike/`)은 S2/S3에 그대로 재사용.

## 구성요소 상세

### ① 컨테이너 이미지 (고정, 문제와 분리)

base: code-server + 런타임 + claude code(+확장) 프리설치. entrypoint = seeder.

주요 환경 변수:
- `ANTHROPIC_BASE_URL=<게이트웨이>` — 외부 직결 차단
- `ANTHROPIC_AUTH_TOKEN=<attempt 가상키>` — 탈취돼도 예산상한·만료·차단으로 무력
- `ANTHROPIC_MODEL=claude-sonnet-*` (서버 강제)
- `ATTEMPT_ID`, `PROBLEM_REF`

⚠️ claude code OAuth는 컨테이너에서 콜백이 깨져 부적합(공식 문서: WSL2/컨테이너). `ANTHROPIC_AUTH_TOKEN` 게이트웨이 경유가 정답.

### ② LiteLLM 게이트웨이 + 가상키

- 진짜 Anthropic 키는 **게이트웨이에만**. 컨테이너엔 가상키만
- `model_name: "*"` → **Sonnet 강제** (클라 우회 불가)
- 요청/응답 전량 `attempt_id`로 로깅 → 정규화 → `submission_files(chat_log)`
- 가상키: `/key/generate`로 자동 발급, 제출/만료 시 폐기
- LiteLLM DB: 메인 postgres 내 별도 논리 DB `litellm` (prisma 자체 관리, 우리 migrations와 분리)

### ③ seeder (크래시 안전)

부팅 시 `/workspace`에 `.attempt-<id>.lock` 있으면 (크래시 재기동) **wipe 금지·재개**, 없으면 `rm -rf && unpack && touch .lock`.

### ④ 슬롯 등록/heartbeat

pod 부팅 → `POST /internal/slots/register` → `hosted.slots.state='ready'` → N초마다 heartbeat. 앱은 ready 슬롯에만 배정.

pod self-register 방식(내부 시크릿 보유)과 적대적 클라이언트 원칙(대원칙 ⑤)의 긴장은 문서에 명시된 우려다. **현재 구현은 두 경로가 모두 존재**: `POST /api/internal/slots/register` 라우트가 실제 배포돼 있어 pod이 x-internal-secret으로 직접 등록하고, **reconcilePool도 k8s pod Ready 상태를 폴링(`syncReadySlots`)해 슬롯 상태를 ready로 동기화**한다. 두 경로는 상호 보완적이며 upsert 로직으로 멱등 처리된다(`apps/web/app/api/internal/slots/register/route.ts`, `apps/web/lib/db/repositories/slots.ts` `syncReadySlots`).

## 학생 셸 구조

```
┌ 상단바: 남은시간(서버 deadline_at 기준) + [제출하기]  ← 앱 컴포넌트
├───────────────────────────────────────────────────
│ iframe: code-server (학생 IDE, ForwardAuth ingress로 접근)
└───────────────────────────────────────────────────
```

- 남은시간은 `attempts.deadline_at` 서버값으로 계산 (클라 시계 불신)
- 마감 시 앱이 iframe 차단 → 제출 페이지로 전환
- 접근 경로: `catchup.localhost/exam-ide/{slotNo}` → Traefik ForwardAuth(`/api/internal/exam-authz` 세션+slotNo 소유권 검사) → stripPrefix → code-server 직결
- 역프록시 방식(Next.js 커스텀 서버 WS)은 k3d traefik에서 502 실측 → ForwardAuth 직결로 채택

## 문제 주입 — 이미지와 문제 분리

```
problem-registry (MinIO / git)
├── planning-2026-09-A/scaffold/    ← 학생 환경에 시드 (공개 골격)
├── planning-2026-09-A/hidden-tests/ ← ⚠️ 서버 전용 (학생 환경 절대 불포함)
└── planning-2026-09-B/             ← 변형(부정행위 방지)
```

- **경우 A** (기본): 부팅 시 initContainer가 `PROBLEM_ID`로 scaffold 시드
- **경우 B** (학생별 변형): 배정(attach) 시점에 시드 — StatefulSet은 generic 유지
- hidden은 서버에만. signed URL로도 노출 금지.

## 0↔50 스케일 운영 모델

### 운영 모델 2종

- **A. 동시 버스트**: 50명 한 창. 전원 같은 벽시계 마감. 풀 단위 0↔50
- **B. 비동기 창**: 기간 내 자유 입장, 개별 타임박스. 풀 = 피크 동시 인원. 슬롯 즉시 회수→재시드→재배정
- A는 B의 특수 케이스 → `batches.warm_count` 파라미터 하나로 단일 엔진

### Hot/Cold Path 구분 (절대 섞지 말 것)

- **Cold path**: pod 개수. 느리게·선언적·GitOps(exam-ops → `catchup-helm` 커밋 → ArgoCD sync)
- **Hot path**: 이미 뜬 pod을 이 학생에게 배정. 즉시·원자적·DB 트랜잭션. 시작 버튼은 git/ArgoCD를 건드리지 않음

## GitOps 운영 경로

**한 곳만 git을 만진다 = exam-ops 서비스** (ArgoCD로 1회 배포, git 배포키 보유).

```
[T-30m] exam-ops: replicas=capacity + PROBLEM_ID → catchup-helm/batches/current.yaml 커밋
        → ArgoCD sync → StatefulSet 0→50, seeder 시드 → pod self-register/heartbeat
        → ready 슬롯 ≥ 로스터 인원까지 폴링 → batch.status='open'
[진행]  앱이 ready 슬롯 배정·iframe 프록시. 제한시간 = attempts.deadline_at 서버 강제
[close] 모든 submission accepted 확인(취합 먼저) → replicas=0 커밋 → scale-down. PVC 잔존
[복구]  sync 실패/슬롯 부족 → exam-ops 재sync·재배포 + 운영자 일정조정·재공지
```

**빌드 ≠ 회차**: 이미지 빌드는 bitbucket pipeline → harbor (가끔). 회차는 exam-ops가 values 커밋 (자주, 빌드 아님).

## 헬스 3층

| 층 | 보장 | 신뢰도 |
|---|---|---|
| ArgoCD (Synced/Healthy) | 선언한 대로 배포됐나 | 배포 사실 |
| k8s probe (readiness/liveness) | 개별 pod 생존 | pod 생존 |
| **앱 heartbeat** | 그 슬롯에 학생을 배정해도 되나 | ⭐ 운영 판단 단일 기준 |

런타임 정상 판정은 ArgoCD가 아니라 **앱 heartbeat**.

## 보안 & 부정행위 방지

**trust='verified'의 전제**:
- egress allowlist: 학생 pod 인터넷 차단, LiteLLM + DNS만 허용 (NetworkPolicy)
- 대화 = 프록시 강제: claude code는 `BASE_URL`로만, 우회 경로 없음
- 산출물 = 서버측 패키징: 제출 시 Job이 `/workspace`를 서버에서 tar+해시 → 클라가 못 바꿈
- pod 하드닝: non-root, seccomp, read-only rootfs, limits. 추가 필요 시 학생 노드만 gVisor

**부정행위 방지**:
- 문제 유출: 변형 뱅크(유형당 ≥3), 학생별 변형(경우 B)
- 채팅 위조: 결과물도 통과해야 + 타이밍/상호작용 분석

## 비동기 창(B) 운영 — 구현 현황

> 2026-06 코드 기준. 아래 항목은 **이미 구현 완료**된 부분과 **미구현** 부분을 구분한다.

**구현 완료**:
- 입장 큐(`hosted.entry_queue`, 마이그레이션 `0013`): ready 슬롯 없을 때 `enqueueTx`로 FIFO 대기, `reconcilePool`이 head부터 원자 배정 (`apps/web/lib/db/repositories/entryQueue.ts`)
- 워밍 버퍼 보충: `reconcilePool`의 `scaleStatefulSet` 호출 (③ 단계)이 부족분을 보충
- 대기 UI: `slot-status` 폴링 엔드포인트 2초 주기 (`apps/web/app/api/exam/[attemptId]/slot-status/route.ts`)
- 큐 배정 시 deadline 재산출(대기 시간 보전): `extendDeadlineTx` 호출

**미구현 / 미확정**:
- idle reclaim: `last_heartbeat_at` 임계값 초과 슬롯 자동 회수 — 코드 없음
- 창 밖 입장 차단: `0007`의 `window_start_at`/`window_end_at` 컬럼은 존재하나 현재 서비스 로직에서 참조하지 않음 (휴면 상태)
- 다중 창 문제 유출 방지: 변형 뱅크 미구현
- `0007` 조건부 CHECK 활성화: 재활용 도입 시 데이터 백필과 함께 (현재 `mode`/`window_*` 컬럼 휴면)

# Examples

**S1 Docker 스파이크 최소 구성**:
```yaml
services:
  proxy:  # LiteLLM
    image: ghcr.io/berriai/litellm
    environment: [ANTHROPIC_API_KEY=..., LITELLM_LOG_DIR=/logs]
  exam:   # code-server + claude code + seeder
    build: ./exam-image
    environment:
      - ANTHROPIC_BASE_URL=http://proxy:4000
      - ATTEMPT_ID=spike-1
      - PROBLEM_ID=planning-2026-09-A
    ports: ["8080:8080"]
```
성공 기준: 브라우저 `:8080`에서 VS Code → 대화 전량이 attempt_id로 저장 → `PROBLEM_ID`만 바꿔 재기동하면 다른 문제가 주입.

# Citations

- 원본: `docs/2-exam-environment.md`
- k8s 매니페스트 초안: [k8s-skeleton](/operations/k8s-skeleton.md)
- 운영 개요: [exam-serving](/operations/exam-serving.md)
- 스토리지/제출: [storage-submission-pipeline](/operations/storage-submission-pipeline.md)
- 구현 계획: [implementation-plan](/operations/implementation-plan.md)
- 코드: `apps/web/lib/services/examOpsService.ts`, `apps/web/lib/k8s/client.ts`, `apps/web/lib/litellm/keys.ts`
- 로컬 운영 스크립트: `deploy/local-k3d/exam-ops.sh`
