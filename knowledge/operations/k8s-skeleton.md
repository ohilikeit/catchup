---
type: Operations Runbook
title: S2 — k3s/ArgoCD 매니페스트 초안
description: S1 Docker 스파이크를 사내 k3s + ArgoCD(GitOps)로 편입할 때의 환경 구성 초안 (스켈레톤).
resource: file:///docs/3-s2-k8s-skeleton.md
tags: [k8s, argocd, helm, statefulset, litellm, networkpolicy, gitops]
timestamp: 2026-06-17T00:00:00Z
---

# S2 — k3s/ArgoCD 매니페스트 초안

> ⚠️ 초안/스켈레톤. 이미지 태그·도메인·StorageClass·실 시크릿·tier 산정은 환경에 맞춰 채워야 한다.

## 핵심 한 줄

상주 서비스(web·postgres·redis·LiteLLM)는 ArgoCD로 선언적 배포(평시에도 떠 있음).
학생 pod 50개는 시험 창에만 0↔50으로 뜨는 별도 레이어.
LiteLLM은 학생당이 아니라 공용 1개(+replica). 가상키는 attempt마다 발급·폐기, 게이트웨이는 안 죽는다.

## 컴포넌트 분류

| 레이어 | 컴포넌트 | 수명 | 관리 |
|---|---|---|---|
| **상주** | web(앱+exam-ops), postgres, redis, litellm | 항상 | ArgoCD 선언(git) |
| **임시** | exam 학생 pod ×50 | 시험 창에만 0↔50 | exam-ops(풀 스케일링) |

```
━━ 상주(ArgoCD) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  web(앱·exam-ops)  postgres(app + litellm DB)  redis
        │ 가상키 발급(/key/generate)              │ rate 동기화
        ▼                                        │
  litellm (Deployment ×2, ClusterIP) ── 진짜 키 ──→ api.anthropic.com
        ▲ http://litellm:4000 (가상키)
━━ 임시(0↔50) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  exam StatefulSet (initContainer=seeder, PVC=/workspace, NetworkPolicy)
```

## 시크릿 관리 원칙

- 진짜 키(`ANTHROPIC_API_KEY`)는 **k8s Secret으로 LiteLLM에만** 주입. 학생 pod에는 절대 들어가지 않음
- `LITELLM_MASTER_KEY`: 가상키 발급용 관리자 키 — web 앱만 보유
- 실 운영은 평문 Secret 대신 **SealedSecrets/External Secrets**로 git 안전 보관
- LiteLLM DB: 메인 postgres의 별도 논리 DB `litellm` (철칙 1: 단일 DB)

## LiteLLM 게이트웨이 (상주 공용)

ConfigMap으로 `config.yaml` 주입. 핵심:
```yaml
model_list:
  - model_name: "*"                        # 모든 요청을
    litellm_params:
      model: anthropic/claude-sonnet-4-5   # Sonnet으로 강제
      api_key: os.environ/ANTHROPIC_API_KEY
general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
  database_url: os.environ/DATABASE_URL    # litellm 전용 DB
```

- replicas: 2 (가용성. rate 상태는 redis로 공유)
- type: ClusterIP — 내부 전용, 외부 비노출
- ⚠️ LiteLLM PyPI 1.82.7/1.82.8 멀웨어 이력 — 검증된 태그로 핀 고정 필수

## web 앱 (상주, 유일한 외부 노출)

- 역할: 앱 셸(상단바+iframe 프록시) + 관리자 대시보드 + exam-ops(가상키 발급·0↔N 스케일·마감 스윕)
- Ingress: `exam.internal` → web Service → Next.js
- ⚠️ code-server iframe 프록시 = websocket. Ingress가 websocket을 통과시켜야 IDE가 동작 (`proxy-read-timeout: "3600"`)

## exam StatefulSet (0↔50)

핵심 설정:
```yaml
replicas: 0                    # 평시 0
serviceName: exam              # headless Service (안정 네트워크 ID)
securityContext:
  runAsNonRoot: true
  seccompProfile: { type: RuntimeDefault }
# runtimeClassName: gvisor   # 격리 강화 필요 시만
initContainers:
  - name: seeder               # PROBLEM_ID로 scaffold 시드 (crash-safe lock)
containers:
  - name: exam
    env:
      - ANTHROPIC_BASE_URL: http://litellm:4000
      # ANTHROPIC_AUTH_TOKEN: attach 시점 주입 (StatefulSet 템플릿에 박지 않음)
    resources:
      requests: { cpu: "500m", memory: "2Gi" }
      limits:   { cpu: "2",    memory: "3Gi" }
volumeClaimTemplates:
  - name: workspace
    accessModes: ["ReadWriteOnce"]
    storage: "5Gi"
```

### 가상키 주입 메커니즘

> ⚠️ 구현 현황(2026-06): 문서 초안의 "배정(attach) 시점 주입" 설계에서 **provision 시점 일괄 발급 + 회차 1키 공유**로 변경됨. 실제 코드(`apps/web/lib/services/examOpsService.ts` `provisionBatch`, `apps/web/lib/k8s/examResources.ts` `virtualKeysSecret`)를 기준으로 기술:

1. **provision 시** `/key/generate`로 회차 공유 가상키 1개 발급 (`alias=catchup-<batchId>-<ts>`, `max_budget=batches.llm_budget_usd`)
2. 모든 슬롯이 **같은 키**를 공유 — Secret `exam-virtual-keys`의 `slot-0`…`slot-N`이 전부 동일 값
3. pod 기동 래퍼가 자기 ordinal에 해당하는 키(`slot-N`)를 `ANTHROPIC_AUTH_TOKEN`으로 export
4. close 시 `/key/block`으로 차단(삭제 아님 — 비용 대시보드 보존 목적)

결과: 슬롯별 개별 spend 귀속 불가, 회차 전체 spend만 집계 가능(`batchOpsSnapshot`의 `totalSpendUsd`). per-slot 예산 상한은 없고 회차 단위 cap만 있음.

## NetworkPolicy — egress 차단

학생 pod은 LiteLLM(4000) + DNS + 사내 패키지 미러만 나갈 수 있음. 외부 AI·인터넷 직결 차단.

```yaml
egress:
  - to: [{ podSelector: { matchLabels: { app: litellm } } }]
    ports: [{ port: 4000 }]
  - to: [{ podSelector: { matchLabels: { k8s-app: kube-dns } } } ]
    ports: [{ port: 53 }]
  # + 사내 npm/pypi 미러
```

⚠️ k3s 기본 flannel은 NetworkPolicy 미적용 — Calico 등 CNI가 필요할 수 있음. k3s는 NP 컨트롤러 내장이라 추가 설치 없이 켤 수 있음(Calico는 더 강한 정책이 필요할 때만).

## 레포 분리 & Helm chart 구조

```
catchup (app 레포)                     catchup-helm (deploy 레포) ← ArgoCD watch
├── apps/web · packages/*              ├── charts/exam-platform/
├── exam-image/ (Dockerfile·seeder)    │     ├── templates/
├── experiments/s1-docker-spike        │     └── values.yaml (replicas: 0)
└── bitbucket-pipelines.yml            ├── values/{local,alpha,prod}.yaml
      │ ① 이미지 빌드 → harbor push     └── batches/current.yaml  ← 회차 overlay
      └ ② catchup-helm image.tag 커밋
```

- 차트 템플릿은 고정. 바뀌는 것은 **values/overlay** (replicas·problemId·deadline)

## 두 종류 트리거 (빌드 ≠ 회차)

| 트리거 | 무엇 | 누가 | 빈도 |
|---|---|---|---|
| **이미지 빌드** | exam/web 이미지 → harbor → image.tag 커밋 | bitbucket pipeline | 가끔(코드 변경) |
| **회차 열기/닫기** | `batches/current.yaml`에 replicas·problemId·deadline 커밋 | exam-ops(대시보드 버튼) | 회차마다 |

## ArgoCD Application 핵심

```yaml
source:
  repoURL: https://bitbucket.org/<org>/catchup-helm.git
  path: charts/exam-platform
  helm:
    valueFiles:
      - ../../values/prod.yaml
      - ../../batches/current.yaml        # 회차 overlay — exam-ops가 갱신
syncPolicy:
  automated: { prune: true, selfHeal: true }
```

## 자동 회차 흐름 (처음부터 자동)

```
대시보드 "회차 열기" 클릭
  → exam-ops: catchup-helm/batches/current.yaml 커밋 (bitbucket API, 배포키)
        exam: { replicas: 50, problemId: ainc2026, deadlineAt: ... }
  → ArgoCD git 변화 감지 → sync → StatefulSet 0→50, seeder가 problemId 시드
[회차 닫기]
  → exam-ops: replicas: 0 커밋 → ArgoCD sync → scale-down
```

**git에는 "규모"만** (replicas·problemId), **DB에는 "런타임"** (유저 매핑·deadline·trust — 앱이 직접).

## 자원 산정 (동시 50)

| | requests | limits |
|---|---|---|
| 학생 1명 | 0.5 vCPU / 1.5 GB | 2 vCPU / 4 GB |
| **50명 합** | **25 vCPU / 75 GB** | 100 vCPU / 200 GB |

- 권장 풀: ~30 vCPU / ~90 GB (예: 16/64 노드 ×3)
- 학생 pod 전용 노드 taint/toleration 분리
- PVC 2~5GB×50 = 100~250GB
- 사전 워밍 5~10개로 동시 시작 체증 흡수

## 남은 TODO

> 구현 현황(2026-06): 로컬 k3d `examResources.ts`는 ConfigMap·Secret·Service·Ingress·Job 매니페스트를 동적 생성하지만 **NetworkPolicy 매니페스트 빌더는 없음** — 로컬 k3d는 NetworkPolicy off.

- [ ] Anthropic Tier 산정 (동시 50, OTPM 병목 → Tier 3+)
- [ ] SealedSecrets/External Secrets 배선 (alpha/prod)
- [ ] 자원 재실측 (50명 동시 부하)
- [ ] gVisor 여부 결정 (학생 노드만 runsc)
- [ ] NetworkPolicy 매니페스트 구현 + CNI 확인 (k3s 내장 NP 컨트롤러 or Calico)
- [ ] Helm chart화 + `catchup-helm` 레포 생성
- [ ] bitbucket pipeline (이미지 빌드 → harbor → image.tag 자동 bump)
- [ ] GitOps 트리거 연결: `★GITOPS` 마커 3종(`scaleStatefulSet`, `applyObject` ConfigMap/Secret, close scale-0)을 `catchup-helm/batches/current.yaml` 커밋으로 교체 (alpha 환경에서 구현 예정)

# Examples

시험 1회차 흐름:
```
[T-30m] replicas=50 + PROBLEM_ID 커밋 → ArgoCD sync → exam 0→50, seeder 시드
        가상키 N개 발급 → pod에 주입
[진행]  학생 로그인 → iframe 프록시 → code-server → litellm → Anthropic
[close] 취합(submission accepted) 먼저 → replicas=0 커밋 → 가상키 폐기
        litellm·pg·redis·web은 계속 상주. PVC 잔존 → 다음 부팅 seeder가 wipe+재시드
```

# Citations

- 원본: `docs/3-s2-k8s-skeleton.md`
- 설계 근거: [exam-environment](/operations/exam-environment.md)
- 운영 개요: [exam-serving](/operations/exam-serving.md)
- 로컬 매니페스트: `deploy/local-k3d/40-exam.yaml`, `deploy/local-k3d/55-exam-ide.yaml`
- Helm chart: `catchup-helm/templates/exam-statefulset.yaml`
- LiteLLM 설정: `infra/litellm/config.yaml`
- 가상키 코드: `apps/web/lib/litellm/keys.ts`
