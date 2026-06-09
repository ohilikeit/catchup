# 3. S2 — k3s/ArgoCD 매니페스트 초안

> 목적: [2-exam-environment.md](./2-exam-environment.md)의 **S1 Docker 스파이크**(로컬 검증 완료)를 사내 **k3s + ArgoCD(GitOps)**로
> 편입할 때의 환경 구성 초안. 인증은 S1에서 확정한 **LiteLLM 게이트웨이 + 가상키**(진짜 키는 게이트웨이에만)를 그대로 옮긴다.
> 근거: 2번 문서 §3(어댑터 구성)·§5(0↔50 스케일)·§6(GitOps 경로)·§7(자원)·§8(보안), reference/[01](./reference/01-framework-monorepo.md)·[02](./reference/02-db-schema.md)·[03](./reference/03-cache.md).
>
> ⚠️ **초안/스켈레톤이다.** 이미지 태그·도메인·StorageClass·실 시크릿·tier 산정은 환경에 맞춰 채워야 한다.
> 아래 yaml은 구조를 보여주는 골격이며, 실값은 placeholder다.

## 핵심 한 줄
**상주 서비스(web·postgres·redis·LiteLLM)는 ArgoCD로 선언적 배포(평시에도 떠 있음). 학생 pod 50개는 시험 창에만 0↔50으로
뜨는 별도 레이어. LiteLLM은 학생당이 아니라 공용 1개(+replica). 가상키는 attempt마다 발급·폐기, 게이트웨이는 안 죽는다.**

---

## 0. 상주 vs 임시 — 컴포넌트 분류 (§5)

| 레이어 | 컴포넌트 | 수명 | 누가 관리 |
|---|---|---|---|
| **상주** | web(앱+exam-ops), postgres, redis, **litellm** | 항상 | **ArgoCD 선언**(git) |
| **임시** | exam 학생 pod ×50 | 시험 창에만 0↔50 | exam-ops(풀 스케일링) |

- S1의 3 컨테이너 → k3s: `litellm-db`는 **메인 postgres에 흡수**(철칙 1: 단일 DB + schema 분리), `proxy`는 **상주 공용 LiteLLM 1개**,
  `exam`은 **StatefulSet 0↔50**.
- 결과: 기존 상주 3개(web·pg·redis) + **LiteLLM 1개 = 4개**. 학생 pod는 별도.

```
━━ 상주(ArgoCD) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  web(앱·exam-ops)   postgres(app + litellm schema)   redis(앱캐시 + litellm rate공유)
        │                                                   ▲
        │ 가상키 발급(/key/generate)                         │ rate limit 동기화
        ▼                                                   │
  litellm (Deployment ×2, ClusterIP) ── 진짜 키(Secret) ──→ api.anthropic.com
        ▲ http://litellm:4000 (가상키)
━━ 임시(0↔50) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  exam StatefulSet (initContainer=seeder, PVC=/workspace, NetworkPolicy)
```

---

## 1. Namespace + 시크릿

진짜 키는 **k8s Secret으로 LiteLLM에만** 주입한다. 학생 pod에는 절대 들어가지 않는다(§8).
실 운영은 평문 Secret 대신 **SealedSecrets/External Secrets**로 git에 안전 보관할 것.

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: exam
---
apiVersion: v1
kind: Secret
metadata:
  name: litellm-secrets
  namespace: exam
type: Opaque
stringData:
  # ⚠️ placeholder — 실값은 SealedSecret/External Secrets로. git에 평문 금지.
  ANTHROPIC_API_KEY: "sk-ant-REPLACE_ME"          # 진짜 키 1개 — 게이트웨이에만
  LITELLM_MASTER_KEY: "sk-master-REPLACE_ME"      # 가상키 발급용 관리자 키
  # 단일 postgres에 litellm 전용 DB/schema. (철칙 1)
  DATABASE_URL: "postgresql://litellm:REPLACE@postgres.exam.svc:5432/litellm"
---
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
  namespace: exam
type: Opaque
stringData:
  # web 앱(셸·대시보드·exam-ops)이 쓰는 자격. 실값은 SealedSecret/External Secrets로.
  DATABASE_URL: "postgresql://app:REPLACE@postgres.exam.svc:5432/app"
  REDIS_URL: "redis://redis.exam.svc:6379"
  LITELLM_MASTER_KEY: "sk-master-REPLACE_ME"      # 가상키 발급용(/key/generate)
  SESSION_SECRET: "REPLACE_ME"
  # 기존 사내 MinIO 연결(클러스터에 새로 배포하지 않음 — 공식 MinIO 재사용)
  MINIO_ENDPOINT: "https://minio.internal"
  MINIO_ACCESS_KEY: "REPLACE_ME"
  MINIO_SECRET_KEY: "REPLACE_ME"
```

---

## 2. LiteLLM 게이트웨이 (상주 공용)

`config.yaml`은 ConfigMap으로. `model_name: "*"` → 무슨 모델을 부르든 **Sonnet으로 서버 강제**(클라 설정은 우회 가능하므로 게이트웨이가 최종 보증, §8 대원칙 5⑤).

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: litellm-config
  namespace: exam
data:
  config.yaml: |
    model_list:
      - model_name: "*"                       # 모든 요청을
        litellm_params:
          model: anthropic/claude-sonnet-4-5  # ← Sonnet으로 강제
          api_key: os.environ/ANTHROPIC_API_KEY
    litellm_settings:
      drop_params: true
    general_settings:
      master_key: os.environ/LITELLM_MASTER_KEY
      database_url: os.environ/DATABASE_URL
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: litellm
  namespace: exam
spec:
  replicas: 2                                  # 가용성/부하용. rate 상태는 redis로 공유.
  selector:
    matchLabels: { app: litellm }
  template:
    metadata:
      labels: { app: litellm }
    spec:
      containers:
        - name: litellm
          # ⚠️ LiteLLM PyPI 1.82.7/1.82.8 멀웨어 — 검증된 태그로 핀 고정할 것.
          image: ghcr.io/berriai/litellm-database:main-stable
          args: ["--config", "/etc/litellm/config.yaml", "--port", "4000"]
          ports: [{ containerPort: 4000 }]
          envFrom:
            - secretRef: { name: litellm-secrets }
          env:
            - { name: REDIS_HOST, value: "redis.exam.svc" }   # replica 간 rate/budget 동기화
            - { name: REDIS_PORT, value: "6379" }
          volumeMounts:
            - { name: config, mountPath: /etc/litellm }
          resources:
            requests: { cpu: "250m", memory: "512Mi" }
            limits:   { cpu: "1",    memory: "1Gi" }
          readinessProbe:
            httpGet: { path: /health/liveliness, port: 4000 }
            initialDelaySeconds: 5
      volumes:
        - { name: config, configMap: { name: litellm-config } }
---
apiVersion: v1
kind: Service
metadata:
  name: litellm
  namespace: exam
spec:
  type: ClusterIP            # 내부 전용 — 학생 pod만 접근, 외부 비노출
  selector: { app: litellm }
  ports: [{ port: 4000, targetPort: 4000 }]
```

> **왜 1개(+replica)면 되나:** LiteLLM은 비동기 패스스루라 가볍다(추론은 Anthropic이 함). 진짜 천장은 **Anthropic 조직 rate
> limit(Tier)**이다 — 동시 50명이면 **Tier 3+ & 프롬프트 캐싱**(cache_read는 ITPM 미산입) 필요. §자세히는 2번 문서/Console.

---

## 2.5 web — 앱 셸·관리자 대시보드·exam-ops (상주, 유일한 외부 노출)

학생이 보는 **앱 셸(상단바 타이머+제출 버튼 + code-server iframe 프록시)**, **관리자 대시보드**(시험 준비·관제, docs/2 §13),
**exam-ops**(가상키 발급·0↔50 스케일·마감 스윕)를 담는 앱. 인터넷에 노출되는 **유일한** 서비스다.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: web, namespace: exam }
spec:
  replicas: 2
  selector: { matchLabels: { app: web } }
  template:
    metadata: { labels: { app: web } }
    spec:
      # (S3) 동적 pod 스케일이 필요해질 때만 RBAC 부여된 SA 사용(§5)
      # serviceAccountName: exam-ops
      containers:
        - name: web
          image: REGISTRY/catchup-web:TAG
          envFrom:
            - secretRef: { name: app-secrets }   # DATABASE_URL·REDIS_URL·MINIO_*·LITELLM_MASTER_KEY·SESSION_SECRET
          ports: [{ containerPort: 3000 }]
          readinessProbe:
            httpGet: { path: /api/health, port: 3000 }
---
apiVersion: v1
kind: Service
metadata: { name: web, namespace: exam }
spec:
  selector: { app: web }
  ports: [{ port: 80, targetPort: 3000 }]
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
  namespace: exam
  annotations:
    # ⚠️ code-server iframe 프록시 = websocket. 인그레스가 websocket을 통과시켜야 IDE가 산다(§2).
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
spec:
  rules:
    - host: exam.internal
      http:
        paths:
          - path: /
            pathType: Prefix
            backend: { service: { name: web, port: { number: 80 } } }
```

> web은 학생 pod(headless `exam`)으로 **iframe 역프록시**하고, LiteLLM `/key/generate`로 가상키를 발급하며, DB(§11·docs/5)를
> 정보원으로 대시보드를 그린다. 학생 pod·litellm·postgres·redis·minio는 전부 내부(ClusterIP) — web만 Ingress로 노출.

---

## 3. 학생 pod — exam StatefulSet (0↔50)

평시 `replicas: 0`, 시험 창에 50. **이미지(환경)와 문제(데이터)는 분리** — initContainer(seeder)가 `PROBLEM_ID`로 scaffold만 시드(§4).
pod 하드닝(non-root/seccomp)과 자원 requests/limits(§7·실측 반영)를 건다.

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: exam
  namespace: exam
spec:
  serviceName: exam
  replicas: 0                       # 평시 0. 시험 시 50 (exam-ops가 §5 풀 스케일링)
  selector:
    matchLabels: { app: exam }
  template:
    metadata:
      labels: { app: exam }
    spec:
      securityContext:              # §8 하드닝
        runAsNonRoot: true
        runAsUser: 1000
        seccompProfile: { type: RuntimeDefault }
      # 학생 노드 전용 분리(taint/toleration). 격리 더 필요하면 학생 노드만 gVisor(runsc) 런타임클래스.
      # runtimeClassName: gvisor
      initContainers:
        - name: seeder              # PROBLEM_ID로 scaffold 시드(crash-safe lock, §6·§11)
          image: REGISTRY/catchup-exam:TAG
          command: ["/usr/local/bin/seed-and-start.sh", "--seed-only"]
          env:
            - { name: PROBLEM_ID, value: "ainc2026" }   # ArgoCD/exam-ops 파라미터
          volumeMounts:
            - { name: workspace, mountPath: /home/coder/project }
      containers:
        - name: exam
          image: REGISTRY/catchup-exam:TAG               # = S1의 catchup-s1-exam (code-server+claude code+확장 프리설치)
          env:
            - { name: ANTHROPIC_BASE_URL, value: "http://litellm:4000" }   # 게이트웨이로
            # ⚠️ 가상키(ANTHROPIC_AUTH_TOKEN)는 여기에 박지 않는다 — §4 참조(attach 시 주입)
            - { name: ANTHROPIC_MODEL, value: "claude-sonnet-4-5" }
            - { name: ANTHROPIC_SMALL_FAST_MODEL, value: "claude-sonnet-4-5" }
          ports: [{ containerPort: 8080 }]
          resources:                # §7 + S1 실측(idle ~0.9GB). PDF=읽기/추출 기준.
            requests: { cpu: "500m", memory: "2Gi" }
            limits:   { cpu: "2",    memory: "3Gi" }
          volumeMounts:
            - { name: workspace, mountPath: /home/coder/project }
  volumeClaimTemplates:             # /workspace = PVC. pod 죽어도 작업물 보존(§2·§11)
    - metadata: { name: workspace }
      spec:
        accessModes: ["ReadWriteOnce"]
        resources: { requests: { storage: "5Gi" } }
        # storageClassName: <환경의 SC>
---
apiVersion: v1
kind: Service
metadata:
  name: exam
  namespace: exam
spec:
  clusterIP: None                   # headless — StatefulSet 안정 네트워크 ID
  selector: { app: exam }
  ports: [{ port: 8080, targetPort: 8080 }]
```

### ⚠️ 가상키를 어떻게 50개 pod에 다르게 주입하나 (§4 경우 B와 같은 문제)
StatefulSet 50 replica는 **같은 템플릿**이라 env로 pod별 다른 `ANTHROPIC_AUTH_TOKEN`을 못 준다. → **attach(배정) 시점 주입**:
1. pod 부팅 → 앱에 self-register/heartbeat(§3④)
2. 앱(exam-ops)이 attempt 배정 시 LiteLLM `/key/generate`로 **그 attempt의 가상키 발급**
3. pod 에이전트가 앱에서 가상키를 받아 claude code 환경(`ANTHROPIC_AUTH_TOKEN`)에 주입
→ StatefulSet은 generic 유지, 가상키·문제변형 모두 같은 attach 메커니즘으로(§4 경우 B와 동일).

---

## 4. NetworkPolicy — egress 차단 (§8)

학생 pod는 **LiteLLM(4000) + DNS + 패키지 레지스트리(npm/pypi)만** 나갈 수 있다. 외부 AI·검색·인터넷 직결 차단.
(방식 C OAuth를 안 쓰므로 `api.anthropic.com` 직결 허용 불필요 — 진짜 egress는 LiteLLM만.)

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: exam-egress
  namespace: exam
spec:
  podSelector:
    matchLabels: { app: exam }
  policyTypes: [Egress]
  egress:
    - to: [{ podSelector: { matchLabels: { app: litellm } } }]   # 게이트웨이만
      ports: [{ port: 4000 }]
    - to: [{ namespaceSelector: {}, podSelector: { matchLabels: { k8s-app: kube-dns } } }]
      ports: [{ port: 53, protocol: UDP }, { port: 53, protocol: TCP }]
    # + 사내 npm/pypi 미러로의 egress(환경의 CIDR/Service로 한정)
```

---

## 5. 레포 분리 · Helm · ArgoCD 자동 트리거

### 5.1 레포 구조 (사내 정책: app/deploy 분리)

위 매니페스트는 **raw yaml이 아니라 Helm chart**로 묶어 `catchup-helm`(deploy 레포)에 둔다. ArgoCD는 이 레포만 watch한다.
```
catchup (app 레포, 모노레포)                  catchup-helm (deploy 레포) ← ArgoCD watch
├── apps/web · packages/* · db/migrations     ├── charts/exam-platform/
├── exam-image/ (Dockerfile·seeder)           │     ├── Chart.yaml
├── experiments/s1-docker-spike (L0 로컬)      │     ├── templates/  (web·litellm·exam StatefulSet·netpol·secret)
└── bitbucket-pipelines.yml                    │     └── values.yaml (기본값: replicas 0)
      │ ① 이미지 빌드 → harbor push            ├── values/{staging,prod}.yaml
      │ ② catchup-helm image.tag 커밋(자동) ─→ ├── batches/current.yaml   ← 회차 overlay(exam-ops가 커밋)
                                               └── argocd/application.yaml
```
- **차트 템플릿(structure)은 고정** — 바뀌는 건 **values/overlay**(replicas·problemId·deadline). git 변경 감지 = values 변경.

### 5.2 두 종류 트리거 (빌드 ≠ 회차)

| 트리거 | 무엇 | 누가 | 빈도 |
|---|---|---|---|
| **이미지 빌드** | exam/web 이미지 → harbor → `catchup-helm` `image.tag` 커밋 | bitbucket pipeline | 가끔(코드 변경) |
| **회차 열기/닫기** | `catchup-helm` `batches/current.yaml`에 `replicas`·`problemId`·`deadline` 커밋 | **exam-ops(자동 버튼)** | 회차마다 |

### 5.3 ArgoCD Application (Helm source = catchup-helm)

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: exam-platform
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://bitbucket.org/<org>/catchup-helm.git    # ★ deploy 레포(app과 분리)
    targetRevision: main
    path: charts/exam-platform
    helm:
      valueFiles:
        - ../../values/prod.yaml
        - ../../batches/current.yaml        # 회차 overlay — exam-ops가 회차마다 갱신
  destination: { server: https://kubernetes.default.svc, namespace: exam }
  syncPolicy:
    automated: { prune: true, selfHeal: true }   # git 변경 자동 감지·sync (= 자동 버튼의 동력)
```

### 5.4 자동 버튼 흐름 (처음부터 자동)

```
대시보드 "회차 열기" 클릭
  → exam-ops가 catchup-helm/batches/current.yaml 커밋 [bitbucket API, 배포키]
        exam: { replicas: 50, problemId: ainc2026, deadlineAt: ... }
  → ArgoCD가 git 변화 감지 → sync → exam StatefulSet 0→50, seeder가 problemId 시드
[회차 닫기]
  → exam-ops가 replicas: 0 커밋 → ArgoCD sync → scale-down
```
- **git에는 "규모"만**: `replicas`(0↔50)·`problemId` → 인프라/문제 선언(감사·롤백). **DB에는 "회차 런타임"**: 유저 매핑·deadline 갱신·trust → 앱이 attach(churn 0).
- exam-ops에 **`catchup-helm` 쓰기 권한**(배포키/앱 비밀번호)만 부여하면 대시보드 버튼 한 번 = git 커밋 = sync = 50 pod.

> **성숙도(§5 순):** ① **batches/current.yaml 커밋**(시작, 위 흐름). ② **ApplicationSet**(회차 다중 동시). ③ **S3 동적 생성**(동시 batch 50 초과 시만, ServiceAccount RBAC 1회 부여).
> ⚠️ 임시 pod 자체를 ArgoCD로 일일이 선언하지 않는다 — replicas 한 줄만 바꿔 churn 최소(§5).

---

## 6. 시험 1회차 흐름 (LiteLLM 끼운 §6 경로)

```
[T-30m] exam-ops: replicas=50 + PROBLEM_ID 커밋 → ArgoCD sync → exam 0→50, initContainer(seeder) 시드
        각 pod self-register → exam-ops가 attempt별 LiteLLM /key/generate(예산·만료·Sonnet) → pod에 가상키 주입
[진행]  학생 → 앱 로그인 → iframe 프록시 → code-server. claude code → litellm(상주) → 진짜 키 → Anthropic.
        대화·spend는 litellm + DB에 집계(+ transcript 회수 collector 병행 가능)
[close] 취합(submission accepted) 먼저 → replicas=0 커밋 → exam 50→0. 가상키 폐기(만료/delete).
        litellm·pg·redis·web은 계속 상주. PVC 잔존 → 다음 부팅 seeder가 wipe+재시드(§11)
[복구]  sync 실패/슬롯 부족 → exam-ops 재sync·재배포 + 운영자 일정조정·재공지로 회복
```

---

## 7. 남은 결정 / TODO (채우고 넘어갈 것)
- [x] **DB 통합 방식 확정**: → **별도 논리 DB `litellm`**(schema·search_path 아님). prisma가 그 DB를 통째 관리하므로 우리 `db/migrations`와 충돌·오염 없이 백업/마이그레이션을 깔끔히 분리. 로컬 실현 완료(`db/postgres-init`·`infra/litellm`·compose `--profile gateway`); prod는 `DATABASE_URL`을 SealedSecret으로(Phase 2b).
- [ ] **Anthropic Tier 산정**: 동시 50명 실측(OTPM 병목) → Tier 3+ 또는 Priority Tier 신청. 캐싱율 모니터링.
- [ ] **시크릿 관리**: SealedSecrets/External Secrets로 진짜 키·master key를 git 안전 보관.
- [ ] **가상키 주입 경로 구현**: exam-ops의 register→/key/generate→pod 전달(attach) 에이전트.
- [ ] **이미지 레지스트리**: S1 `catchup-s1-exam` → 사내 레지스트리 push, 태그 핀.
- [ ] **자원 재실측**: 50명 동시 부하에서 requests/limits 검증(현재 req 0.5/2Gi, lim 2/3Gi는 PDF=읽기 기준 초안).
- [ ] **gVisor 여부**: 격리 강화 필요 시 학생 노드만 runsc 런타임클래스(§1·§9).
- [ ] **NetworkPolicy CNI 지원**: k3s 기본 flannel은 NetworkPolicy 미적용 — Calico 등 필요할 수 있음.
- [ ] **DB 마이그레이션**: `batches/attempts/attempt_events/hosted.slots`·submission_files 확장(철칙 1, docs/5 §3).
- [ ] **MinIO 버킷·정책**: exam-scaffold/exam-hidden(서버전용)/exam-artifacts/exam-chatlogs (docs/5 §2). 기존 사내 MinIO에 생성.
- [ ] **web 이미지·Ingress**: 앱 셸(상단바·iframe)·대시보드·exam-ops 빌드, websocket 통과 ingress 검증.
- [ ] **Helm chart화 + `catchup-helm` 레포**(§5.1): raw yaml → `charts/exam-platform`, `values/{staging,prod}.yaml` + `batches/current.yaml`. ArgoCD source를 catchup-helm으로.
- [ ] **bitbucket pipeline**: `catchup` push → 이미지 빌드 → harbor → `catchup-helm` `image.tag` 자동 bump 커밋.
- [ ] **exam-ops git 권한**: `catchup-helm` 쓰기(배포키/앱 비밀번호) — 자동 회차 커밋(§5.4)용.
