---
type: Operations Runbook
title: 구현 계획 — 최종 시험 환경 구축 로드맵
description: 설계 문서들을 무엇을·어떤 순서로 만들지 하나의 실행 계획으로 종합한 로드맵 (현황 스냅샷 포함).
resource: file:///docs/6-implementation-plan.md
tags: [roadmap, phases, implementation, status, gitops, exam-ops]
timestamp: 2026-06-17T00:00:00Z
---

# 구현 계획 — 최종 시험 환경 구축 로드맵

## 핵심 한 줄

S1(로컬 Docker)에서 핵심 루프 검증 완료. 이제 ① 플랫폼 코어(DB·MinIO·앱 셸·대시보드) → ② S2 k8s 편입 → ③ exam-ops 자동화 → ④ 50 동시 리허설 순으로 쌓는다. 전달방식은 hosted 단일(BYOD 폐기).

## 환경 3계층 전략

같은 Helm chart 1벌에 values 파일만 갈아끼운다. 환경 차이는 전부 values에 격리.

| 환경 | 역할 | 규모 | 이미지 출처 | 배포 |
|---|---|---|---|---|
| **local (k3d)** | 기능 검증만 | 2~5명 | `k3d image import` (레지스트리 우회) | helm 직접 / 로컬 ArgoCD |
| **alpha (사내)** | 실 GitOps 파이프라인 검증 | 10~20명 | harbor (bitbucket pipeline) | ArgoCD auto-sync |
| **prod (사내)** | 50 동시·실부하 | 50명 | harbor | ArgoCD auto-sync |

harbor는 로컬에 복제하지 않음. NetworkPolicy: 로컬 off, alpha/prod on.

## 컴포넌트 현황 (2026-06 스냅샷)

| 컴포넌트 | 상태 |
|---|---|
| exam 이미지 (S1) | ✅ 완료 (`experiments/s1-docker-spike/`) |
| LiteLLM 게이트웨이 + 가상키 | ✅ 완료 |
| DB 스키마 | ✅ 완료 (0003~0014 마이그레이션) |
| MinIO 버킷·정책 | ✅ 완료 (`lib/storage`, setup.sh 부트스트랩) |
| 문제 업로드 (scaffold/hidden → MinIO) | ✅ 완료 (`problemService`) |
| 앱 셸 (상단바+ForwardAuth IDE) | ✅ 로컬 k3d e2e 검증 완료 |
| 관리자 대시보드 | ✅ 회차개설·로스터·운영액션·슬롯분포·spend 관제 구현 |
| 제출 파이프라인 (패키징 Job) | ✅ 완료 (tar+sha256→MinIO→콜백→submissions accepted) |
| 마감 자동 회수 | ✅ 완료 (onExpire 즉시·close sweep·수동 sweep) |
| 재접속 복귀 | ✅ 완료 (reconnect 이벤트 디바운스 5분) |
| spend 관제 (BatchOpsPanel) | ✅ 완료 |
| exam-ops 자동화 (로컬판) | 🟡 가상키 주입·슬롯별 라우팅·provision/close 구현 완료 |
| GitOps 트리거 (alpha) | ⬜ `★GITOPS` 마커 3종 식별 완료, 실 파이프라인 연결 대기 |
| 비동기 슬롯 재활용 | ⬜ 명부 > capacity가 실제 필요해질 때 (현재 불필요) |
| catchup-helm 레포 + Helm chart | ⬜ |
| bitbucket pipeline (harbor) | ⬜ 아티팩트(`bitbucket-pipelines.yml`) 작성 완료, 실행은 사내 |
| 50 동시 리허설 | ⬜ (Phase 4, prod 전용) |

**로컬 k3d 실검증 완료 (2026-06-10)**: provision(가상키 발급→pod별 주입→시드→슬롯별 Service/Ingress→슬롯 ready) → 비로그인 `/exam-ide/0/` 401 → 패키징 Job(tar+sha256→MinIO→콜백→submissions accepted·verified) → close(키 revoke·라우팅/Secret 삭제·replicas 0·슬롯 down) 전 사슬 동작.

⚠️ **ArgoCD selfHeal 일시 해제 상태** — 로컬 manifest 변경(30-web RBAC·40-exam 래퍼·55 미들웨어)이 exp 브랜치 미푸시 상태라 selfHeal이 되돌리는 문제로 검증 중 해제. exp push 후 복원:
```
kubectl -n argocd patch application catchup-local --type merge \
  -p '{"spec":{"syncPolicy":{"automated":{"prune":true,"selfHeal":true}}}}'
```

## Phase 0 — S1 로컬 검증 ✅

- exam 이미지 빌드, crash-safe seeder
- LiteLLM 게이트웨이 + 가상키 자동 발급, `*`→Sonnet 강제
- `PROBLEM_ID` 교체 문제 주입, hidden 미포함 확인
- 자원 cgroup 제한 실측 (2cpu/4g, ~198% cap)

## Phase 1 — 플랫폼 코어 ✅ (로컬 완결)

### 1a. DB 스키마
마이그레이션 `0003~0014`. litellm DB: 메인 postgres 내 별도 논리 DB `litellm` (prisma 자체 관리).
구현 차이: `attempt_status`는 ENUM이 아닌 **CHECK 제약**으로 구현 (`ready|running|submitted|expired|void`).

### 1b. MinIO 버킷·정책
4개 버킷, 전부 private. `lib/storage` 래퍼 (put·get·서명 URL·서버 sha256·sanitize).

### 1c. 앱 셸 + hosted IDE
- ForwardAuth ingress: `catchup.localhost/exam-ide/{slotNo}` → authz → code-server 직결
- 역프록시(Next.js 커스텀 서버 WS) 방식 → k3d traefik 502 실측 → ForwardAuth 직결로 우회
- 재접속 복귀: `findActiveSlotByAttempt` 슬롯 매핑·서버 deadline 기준 카운트다운
- ⚠️ 동시 1세션 정책 (다기기 재접속 시 이전 세션 무효화) 미구현

### 1d. 관리자 대시보드
- 회차 개설·로스터 import (xlsx)·스코프 강제
- 문제 업로드 (서버 sha256, scaffold→exam-scaffold, hidden→exam-hidden)
- 운영 액션: 시간 연장·무효·강제 제출
- 실시간 관제: 슬롯 상태분포 + 슬롯별/합계 spend (`BatchOpsPanel`, fail-soft)
- 삭제 정책: 이력 없으면 하드 삭제, 있으면 소프트(비활성/취소). RESTRICT 체인이 강제.

**Phase 1 게이트**: 대시보드 회차 생성·문제 업로드·MinIO 실물 저장 ✅. iframe 프록시 로컬 k3d 검증 ✅.

## Phase 2 — S2 k8s 편입 🟡

### 2a. Helm chart 작성 + 로컬 k3d 검증
로컬 ArgoCD Application, ingress, 단일 `.env.secret` 시크릿 렌더, exam seeder(MinIO), exam-ops 동작. 🟢 거의 완료.

### 2b. alpha 실 GitOps 파이프라인 ⬜
- bitbucket pipeline: `catchup` push → 이미지 빌드 → harbor → `catchup-helm` image.tag 자동 bump
- SealedSecrets/External Secrets 배선
- ArgoCD Application: source=`catchup-helm`, 상주 선언 + StatefulSet replicas=0
- NetworkPolicy 적용 (k3s 내장 NP, 필요시 Calico)
- PVC StorageClass·학생 노드풀 (taint/toleration, RWO 제약)

**Phase 2 게이트**: (로컬) k3d에서 exam 1개 띄워 학생 1명이 S1과 동일 동작 / (alpha) ArgoCD가 상주를 배포하고 StatefulSet 스케일이 파이프라인으로 동작.

## Phase 3 — exam-ops 자동화 🟡 (로컬판 거의 완결)

### 구현 완료
- **가상키 주입**: provision 시 **회차 공유 가상키 1개** 발급 (`/key/generate` 1회 호출, `alias=catchup-<batchId>-<ts>`, `max_budget=llm_budget_usd`) → 모든 슬롯이 동일 키 공유 → Secret `exam-virtual-keys`의 `slot-0`…`slot-N` 전부 동일값 → pod 기동 래퍼가 자기 ordinal 키를 `ANTHROPIC_AUTH_TOKEN`으로 export. close 시 `/key/block`(삭제 아님 — 비용 대시보드 보존). 슬롯별 개별 spend 귀속 불가.
- **슬롯 할당 = hot path**: `UPDATE … FOR UPDATE SKIP LOCKED`, git/ArgoCD/Helm 무관
- **워밍 풀 통합 (A=B 단일 엔진)**: `batches.warm_count` 파라미터 하나로 통합. 모드 분기 코드 없음. provision은 capacity만큼 인프라 전부 선생성, replicas만 warm_count로 시작. reconcile이 버퍼 보충·큐 배정 담당
- **대기 UI**: 단계 표시 (대기열 n번째 → 환경 기동 중 → 문제 설치 중 → 연결). 2초 폴링 채택 (WS는 k3d traefik 502 실측으로 비권고)
- **슬롯별 라우팅/격리**: provision이 `/exam-ide/{slotNo}` Ingress + pod 고정 Service 동적 생성. authz가 경로 슬롯 번호 == 배정 슬롯 대조
- **제출 파이프라인**: 패키징 Job (PVC readOnly→tar+sha256→MinIO→콜백), fail-soft
- **마감 자동 회수**: onExpire·close sweep·수동 sweep

### GitOps 트리거 ⬜ (alpha에서 구현)
`examOpsService`의 `★GITOPS` 마커 3종 (scale·ConfigMap/Secret apply) 식별 완료. alpha부터 k8s API 직접 호출부를 `catchup-helm/batches/current.yaml` 커밋으로 교체.

### 비동기 슬롯 재활용 ⬜ (명부 > capacity일 때만)
`submitting→recycling→ready` 재활용 + 재배정 전 PVC wipe+재시드. ⚠️ 반쪽 구현 금지 (PVC wipe 없는 recycling→ready는 이전 학생 작업물 누수 = 누수 0 불변식 위반). 명부>capacity가 실제 필요해질 때 window 모드 CHECK와 함께 도입.

0007 `mode`/`window_*` 컬럼은 현재 휴면. 조건부 CHECK (`mode='window' ⇒ window_start_at NOT NULL`)는 기존 행이 `window_start NULL`이라 지금 추가하면 마이그레이션 실패 → 재활용 도입 시 데이터 백필과 함께 0014로.

**Phase 3 게이트**: 대시보드 "회차 열기" 한 번으로 프로비전→배정→캡처→취합→scale-down이 자동.

## Phase 4 — 50 동시 리허설 ⬜ (prod 전용)

- Anthropic Tier 산정 (소수 실측 → Tier 3+ 또는 Priority Tier, 캐싱율 모니터링)
- 자원 재실측 (50명 동시 requests/limits, 사전 워밍 5~10 pod)
- 50개 동시 리허설: 프로비전→배정→캡처→취합→scale-down→재시드 초기화 통과
- 장애 주입: pod crash·노드 장애·게이트웨이 replica 죽음·재접속
- 복구 리허설: 재배포·일정조정으로 장애 회복

**Phase 4 게이트 = S2 완료**: 50명 동시 회차가 사고 없이 한 사이클 완주, 모든 결과가 MinIO+DB에 보존.

## 의존 그래프

```
Phase 0 (S1 ✅)
   └→ Phase 1 (코어 ✅ 로컬 완결)
        └→ Phase 2 (2a 로컬 k3d ✅ → 2b alpha 파이프라인 ⬜)
             └→ Phase 3 (exam-ops 자동화 🟡 로컬판 — GitOps 트리거·재활용 ⬜)  ← 현재
                  └→ Phase 4 (50 동시 리허설 ⬜, prod 전용)
[이후] S3 동적 오케스트레이터 — 동시 batch 50 초과로 실제 필요해질 때만
```

## 횡단 원칙

- 경계를 이름으로 (패키지·DB schema 분리)
- 불변식은 DB가 강제 (NOT NULL·FK·트리거)
- 단순함은 의도된 선택 (과설계 금지)
- 클라 입력은 적대적 — 점수·모델·trust·소유권은 서버가 재판단
- 시크릿은 게이트웨이/Secret에만, git 평문 금지
- **풀(cold/GitOps) ≠ 할당(hot/DB)**: 시작 버튼은 git을 안 만진다

# Citations

- 원본: `docs/6-implementation-plan.md`
- 설계 문서: [exam-environment](/operations/exam-environment.md), [k8s-skeleton](/operations/k8s-skeleton.md), [exam-serving](/operations/exam-serving.md), [storage-submission-pipeline](/operations/storage-submission-pipeline.md)
- exam-ops 서비스: `apps/web/lib/services/examOpsService.ts`
- 시험 서비스: `apps/web/lib/services/examService.ts`
- k8s 클라이언트: `apps/web/lib/k8s/client.ts`, `apps/web/lib/k8s/examResources.ts`
- 로컬 매니페스트: `deploy/local-k3d/`
- ArgoCD 복원 명령: `kubectl -n argocd patch application catchup-local --type merge -p '{"spec":{"syncPolicy":{"automated":{"prune":true,"selfHeal":true}}}}'`
- S1 산출물: `experiments/s1-docker-spike/`
