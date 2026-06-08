# 2. 시험 환경 — 제공 어댑터 인프라

> 목적: [1-web-platform-planning.md](./1-web-platform-planning.md) §5 **제공 어댑터**의 구현 상세. 계약은 하나 —
> "attempt에 대해 **accepted된 정규화 Submission**을 만든다." 코어(1번)는 이 문서를 *모른다*; 어댑터는 갈아끼울 수 있다.
> 전제: **사내망 + 기존 k3s + ArgoCD(GitOps), 직접 kubectl 불가, 동시 최대 50명/회차, 실험 단계.**
> 근거: reference/[02](./reference/02-db-schema.md)·[03](./reference/03-cache.md)·[05](./reference/05-security.md)·[09](./reference/09-optimization.md).

## 핵심 한 줄
**hosted 어댑터=사내망 k3s 위 학생별 격리 컨테이너(code-server) + LLM 프록시 캡처, GitOps로 0↔50 스케일(직접 kubectl 없음).
프록시가 대화 전량을 정규화 포맷으로 캡처해 accepted submission을 채운다.**

---

## 0. 세 문제 → 한 결정, 그리고 단계별 가능성 확인

운영상 세 문제(① 유료 AI 툴 제공 ② 시험 환경 ③ 채팅 수집)는 **"환경을 우리가 호스팅하는가"** 한 축으로 묶인다.
호스팅하면: ① 우리 API 키, ② 격리 컨테이너, ③ 프록시가 대화 자동 저장 — **세 개가 한 번에 해결된다.**

각 단계는 다음으로 넘어가기 전 **go/no-go 기준**이 있다.

| 단계 | 목표 | 통과 기준(go) | 필요한 것 |
|---|---|---|---|
| **S1 로컬 Docker 스파이크** | hosted 어댑터 핵심 루프 증명 | 학생 1명: 브라우저 code-server→claude code 풀이 → **대화 전량 프록시 저장** → 산출물 회수 → 정규화 submission 1건. `PROBLEM_ID` 교체로 다른 문제 주입 확인 | **Docker만**(VM 1대). k3s/ArgoCD 불필요 |
| **S2 사내망 k3s 스케일 풀** | 동시 50 운영 | **50개 동시 리허설**: 프로비전→배정→캡처→취합→scale-down→재시드 초기화 | k3s+ArgoCD(git만), 오브젝트 스토리지 |
| **S3 동적 오케스트레이터** | 동시 batch가 50 초과 | (필요해질 때) per-attempt 생성/회수 | ServiceAccount RBAC(ArgoCD로 1회 부여) |

> ⭐ S1은 **네 PC에 k3s/ArgoCD를 깔 필요가 없다** — 클러스터 정치와 무관하게 가장 빨리 배운다. S1에서 만든
> 이미지·프록시·seeder가 S2/S3에 그대로 재사용된다.

---

## 1. 설계 결정 — 왜 자체 k3s + code-server

선택지는 2축(샌드박스 방식 × IDE). 사내망 + 기존 k3s/ArgoCD라는 전제가 답을 정한다.

| 경우 | 구성 | 격리 | 운영 부담 | 판정 |
|---|---|---|---|---|
| **1. 자체 k3s + code-server** | 기존 GitOps에 학생 pod, 풀 VS Code | pod + 하드닝 | **이미 가진 스택 → 최소** | ✅ **채택** |
| 2. 자체 k3s + 경량 에디터+터미널 | Monaco+xterm 직접 제작 | pod | UX 직접 유지(노동↑) | 자원 절감 이득 작음(50상한) → 비채택 |
| 3. 관리형 샌드박스(E2B/Daytona) + code-server | 샌드박스 런타임 사내망 이식 | microVM(최강) | 새 플랫폼 운영표면 | 격리 강박 시만. 9월 일정엔 과함 |
| 4. 관리형 + 경량 에디터 | 3+2 단점 합집합 | microVM | 높음 | 비채택 |

**채택 = 경우 1.** 이유: 이미 k3s+ArgoCD를 굴려 한계 운영비용 최소, 사내망 요구 자연 충족, 풀 IDE로 바이브코딩 경험 최고.
학생은 계약된 식별 사용자(익명 인터넷 아님)라 위협모델 중간 → **microVM 대신 pod 하드닝 + NetworkPolicy로 충분**.
격리를 더 올리려면 경우 3 전체 도입보다 **학생 노드만 gVisor(`runsc`) 런타임클래스**가 훨씬 싸다(§9).

`★ 관리형(SaaS)은 사내망과 충돌` — E2B/Daytona의 클라우드는 데이터가 망 밖으로 나가고 폐쇄망 접근이 막힌다. 자체호스팅
이식은 가능하나 새 운영표면이라 보류.

---

## 2. code-server 멘탈 모델 + 1:1 접속

**code-server = VS Code를 서버에서 돌리고 화면만 브라우저로 보내는 것.** 학생은 로컬처럼 느끼지만 파일·터미널·프로세스는
전부 컨테이너 안. (Codespaces/Gitpod와 같은 패턴.) 학생당 컨테이너 1개 = **격리된 작은 클라우드 PC.**

```
┌─ 학생 컨테이너 1개 ───────────────┐
│ code-server (브라우저로 보낼 VS Code) │
│ claude code CLI (BASE_URL→프록시)    │
│ Node/Python 런타임                  │
│ /workspace  ← 문제 scaffold + 작업물 │ ← 여기에만 PVC 마운트(영속)
│ CPU/RAM requests·limits (상한)       │
└─────────────────────────────────┘
```

- **스토리지(PVC):** 컨테이너 FS는 휘발 → 작업 디렉터리에만 PVC. pod 죽어도 PVC 살아 **작업물 복구**. 2~5GB/학생.
- **CPU/메모리:** `requests`(보장, 스케줄러 예약) + `limits`(상한, 초과 시 throttle/OOM). AI가 짠 폭주 코드가 다른 49명을 못 굶긴다.
- ⭐ **1:1 접속 — raw URL을 학생에게 주지 않는다.** 컨테이너는 외부 비노출(k3s `ClusterIP`), 오직 우리 앱만 도달.
  ```
  학생 → 앱 로그인 → 앱: "attempt #42 → 슬롯 #7" → 앱이 iframe으로 슬롯 #7을 프록시
  ```
  "접속코드" = 로그인→attempt→슬롯 매핑(DB). 앱이 누가 어느 컨테이너인지 안다.
- ⚠️ code-server는 **websocket**을 많이 쓴다 → 앞단 프록시(앱/인그레스)가 websocket을 통과시켜야 IDE가 산다.
  인증·websocket·세션을 앱 한 곳에서 통제하는 또 다른 이유.
- ⭐ **앱 셸 = 상단바 + iframe.** 학생이 보는 화면은 code-server raw가 아니라 **앱의 시험 페이지**다:
  위쪽 **상단바**(서버 기준 **남은시간 카운트다운** + **제출 버튼**), 아래 **iframe**(code-server).
  ```
  ┌ 상단바: ⏳ 남은시간 12:34   [제출하기]  ← 앱 컴포넌트(서버 deadline_at 기준)
  ├─────────────────────────────────────
  │ iframe: code-server (학생 IDE)
  └─────────────────────────────────────
  ```
  남은시간은 `attempts.deadline_at` 서버값으로 계산(클라 시계 불신). 마감 시 앱이 **iframe을 차단하고 제출 페이지로 전환**.
  제출 버튼/마감 → **서버측 패키징**으로 MinIO+DB 저장(§11, 상세 [5-storage-submission-pipeline.md](./5-storage-submission-pipeline.md)).

---

## 3. 어댑터 A 구성요소

```
학생 브라우저 ─iframe(앱 프록시)→ [code-server] ─내부→ [claude code] ─(BASE_URL+가상키)→ [LiteLLM 게이트웨이] → api.anthropic.com
                                     │ /workspace(PVC)                                          │ 진짜 키·"*"→Sonnet·로깅(유일 egress)
                                     │ initContainer(seeder)                                    ▼
                                     └ 부팅 시 self-register/heartbeat → 앱            정규화 → submission(proxy, verified)
```

**① 컨테이너 이미지(고정, 문제와 분리)** — base: code-server + 런타임 + **claude code(+확장) 프리설치**. entrypoint=seeder.
env: `ANTHROPIC_BASE_URL=<게이트웨이>`, `ANTHROPIC_AUTH_TOKEN=<attempt 가상키>`, `ANTHROPIC_MODEL=claude-sonnet-*`, `ATTEMPT_ID`, `PROBLEM_REF`.
**② LLM 게이트웨이(LiteLLM) + 가상키** — 진짜 Anthropic 키는 **게이트웨이에만**(컨테이너 밖). 컨테이너엔 `ANTHROPIC_BASE_URL` +
attempt별 **가상키**(`ANTHROPIC_AUTH_TOKEN`)만 — 탈취돼도 **예산상한·만료·차단**으로 무력. `model_name:"*"`→**Sonnet 강제**(클라 우회 불가).
요청/응답 전량 `attempt_id`로 로깅→정규화→`submission_files(chat_log)`. 가상키는 `/key/generate`로 자동 발급, 제출/만료 시 폐기. 해시캐싱 reference/03.
⚠️ claude code **OAuth는 컨테이너에서 콜백이 깨져 부적합**(공식 문서: WSL2/컨테이너) — `ANTHROPIC_AUTH_TOKEN` 게이트웨이 경유가 정답.
**③ seeder(크래시 안전)** — §6.
**④ 슬롯 등록/heartbeat(k8s API 없이 앱이 상태 파악)** — pod 부팅→`POST /internal/slots/register`→`hosted.slots.state='ready'`,
N초 heartbeat. 앱은 **ready 슬롯에만** 배정.

---

## 4. 문제 주입 — 레지스트리 + 회차/학생 변형

**원칙: 이미지(환경)에 문제를 굽지 않는다. 문제는 데이터로 주입.** 같은 이미지에 문제만 갈아끼운다.

```
problem-registry (오브젝트 스토리지 / git)
├── planning-2026-09-A/
│   ├── scaffold/        ← 학생 환경에 들어감(공개 골격)
│   └── hidden-tests/    ← ⚠️ 학생 환경에 절대 안 들어감(서버 평가용, 05)
├── planning-2026-09-B/  ← 변형(대학별/부정행위 방지)
└── ...
```
- **경우 A: 배치 전원 같은 문제** — pod 부팅 시 initContainer가 `PROBLEM_ID`로 `scaffold` 시드. `PROBLEM_ID`는 **ArgoCD 파라미터**
  (시험마다 git 값 하나만 교체) = workflow에 포함.
- **경우 B: 학생별 변형(부정행위 방지)** — StatefulSet 50 replica는 같은 템플릿이라 env로 학생차를 못 줌 → **배정(attach) 시점에 시드**:
  앱이 "attempt #42 → 변형 B" 결정 → 슬롯 pod 에이전트에 "변형 B 로드" 지시 → `/workspace`에 시드. StatefulSet은 generic 유지.
- ⭐ **hidden은 서버에만.** scaffold만 환경에. signed URL로도 hidden 노출 금지.
- 9월 1기: 경우 A로 시작, 부정행위가 실제 문제되면 경우 B(같은 시드 메커니즘, 시점만 boot→attach) **추가**.

---

## 5. 0↔50 스케일 — 누가 올리고 내리나 (상시 50 띄우지 않음)

**운영 모델 2종** — 어느 쪽이든 *풀 스케일(이 절)*과 *슬롯 할당(§6)*은 **별개 경로**다:
- **A. 동시 버스트** (50명 한 창): 수요 = 창 동안 50, 그 외 0. 전원 같은 벽시계 마감. 풀 단위 0↔50.
- **B. 비동기 창** (기간 내 자유 입장): N일 창에 학생이 흩어져 입장, **개별 타임박스**(`attempts.deadline_at`=입장+제한시간, docs/5 §3 상속/override). 풀 = **피크 동시 인원**(≪ 전체 명부), 끝난 슬롯은 **즉시 회수→재시드→재배정**(§6). → **pod 수가 명부가 아니라 피크에 묶여 더 가볍다**(시스템팀 "pod 개수" 우려에 대한 설계적 답).
- A는 B의 특수 케이스(전원 동시 입장·공유 마감) → **`batches` 운영모드 플래그** 하나면 한 코드로 커버. B는 슬롯 재활용 상태머신(§6)이 추가.

평시 `replicas:0`(자원 0). **풀 용량**(A=50 / B=피크+워밍 버퍼)을 창 시작에 올리고 종료에 0. **누가 올리고 내리나**(성숙도 순):

| 방식 | 어떻게 | 자동화 | 적합 |
|---|---|---|---|
| **수동 GitOps** | 시험 전 `replicas:50`+`PROBLEM_ID` 커밋→ArgoCD sync, 끝나면 `0` | ✕ | **실험·초기**(추천 시작) |
| 앱→ArgoCD API | exam-ops가 ArgoCD API로 param sync 호출 | ○ | 회차 잦아질 때 |
| 스케줄러/KEDA | 시험 일정 따라 자동 | ○○ | 운영 성숙기 |

> ⭐ **레포 분리 + 자동 트리거(확정):** 배포는 `catchup-helm`(deploy 레포, ArgoCD watch), 앱은 `catchup`(app 레포).
> "회차 열기" = exam-ops가 `catchup-helm`의 `batches/current.yaml`에 `replicas:50`·`problemId` 커밋(bitbucket API) → ArgoCD가 감지·자동 sync.
> 즉 위 표의 "자동"을 **처음부터** 적용한다. **빌드(이미지)≠회차(스케일)**는 분리 — 상세 [3-s2-k8s-skeleton.md](./3-s2-k8s-skeleton.md) §5.

⭐ **할당과 스케일은 다른 경로다 (hot/cold path) — 절대 섞지 마라:**
- **Cold path = 풀 용량**(이 절): pod가 *몇 개* 떠 있나. 느리게·선언적·GitOps(exam-ops→`catchup-helm` 커밋→ArgoCD sync). 회차 열기/닫기·풀 보충 같은 coarse 사건만. 최종 일관성 OK.
- **Hot path = 슬롯 할당**(§6): 이미 뜬 pod 하나를 *이 학생에게* 배정. 즉시·원자적·**DB 트랜잭션**. ⚠️ **시작 버튼은 git/ArgoCD/Helm을 건드리지 않는다** — 미리 뜬 풀에서 DB로 꺼내 쓴다(docs/3 §5.4 "git엔 규모만, DB엔 런타임 매핑"과 동일 원칙).

**동적 vs 선언 — 메커니즘(왜 ArgoCD를 임시 pod에 안 쓰나):**
- 오래 사는 고정 서비스(앱·프록시·exam-ops) → **ArgoCD 선언**.
- 짧게 사는 학생 pod → **풀 스케일링**(S2) 또는 **동적 생성**(S3). ArgoCD로 임시 pod을 선언하면 git churn·sync 지연.
- **S3 동적 생성:** 클러스터 안 상주 오케스트레이터가 **자기 ServiceAccount**로 k8s API를 불러 pod 생성/삭제. *너의* kubectl 불필요 —
  단 그 SA에 pod 관리 RBAC을 **ArgoCD로 1회 부여**하면 끝. (JupyterHub/Coder/CI 러너 방식.) 동시 batch가 50 초과로 *실제* 필요할 때만.
- ⚠️ **scale-down ≠ 자동 초기화:** StatefulSet `volumeClaimTemplates` PVC는 replicas 0으로 내려도 **안 지워진다**(k8s 안전 기본값).
  → 초기화는 §6의 "seeder 부팅 wipe+재시드"로 보장.

---

## 6. GitOps 운영 경로 (kubectl 없이)

**한 곳만 git을 만진다 = exam-ops 서비스**(ArgoCD로 1회 배포, git 배포키 보유). 사람은 클러스터 미접속.

> ⚠️ **빌드 ≠ 회차:** 이미지 빌드는 `catchup` push → bitbucket pipeline → harbor(가끔, 빌드). 회차는 exam-ops가 `catchup-helm` values 커밋(자주, 빌드 아닌 스케일). exam-ops는 **`catchup-helm` 배포키만** 보유.

```
[T-30m 회차 open]
 exam-ops: 목표상태(replicas=capacity, PROBLEM_ID=problem_version) → catchup-helm/batches/current.yaml 커밋&푸시
   → ArgoCD sync → StatefulSet 0→50, initContainer(seeder) 실행 → pod self-register/heartbeat
 exam-ops: ready 슬롯 ≥ 로스터 인원까지 폴링(**heartbeat 기준 — k8s API 불필요**) → batch.status='open'
[진행] 앱이 ready 슬롯 배정·iframe 프록시. 제한시간 = attempts.deadline_at 서버 강제
[close] 모든 submission accepted 확인(**취합 먼저!**) → replicas=0 커밋 → scale-down. PVC 잔존, 다음 부팅 seeder가 초기화
[복구] sync 실패 / 마감까지 ready 부족 → exam-ops 재sync·재배포 + 운영자 일정조정·재공지로 회복
```
- **健康 3층:** ArgoCD(Synced/Healthy=배포 realized) + k8s probe(개별 pod 자동치유) + **앱 heartbeat(배정 가능?)**.
  런타임 정상 판정은 **ArgoCD 아님** — heartbeat가 단일 근거(k8s 접속 회피).
- **복구 경로:** 호스팅 실패는 재배포·일정조정으로 회복한다(작업물은 PVC에 보존, 마감은 서버가 강제).

### 슬롯 할당 = hot path (버튼 클릭 → DB 트랜잭션, git 아님)
"[진행] 앱이 ready 슬롯 배정"의 실체 — **ArgoCD API도 Helm 변경도 아니다.** 미리 뜬 풀에서 ready 슬롯을 **원자적으로 점유**한다:
```sql
-- 빈 슬롯 1개를 동시성-안전하게 점유 (5명이 동시에 눌러도 서로 다른 슬롯)
UPDATE hosted.slots SET state='assigned', attempt_id=$1
WHERE (batch_id, slot_no) = (
  SELECT batch_id, slot_no FROM hosted.slots
  WHERE batch_id=$2 AND state='ready'
  LIMIT 1 FOR UPDATE SKIP LOCKED      -- ★ 이중배정 불가의 핵심
) RETURNING slot_no, endpoint;
```
1. 잡힘 → `attempts`(status='running'·`deadline_at`=now()+제한시간) + `attempt_events` 'started'. ⚠️ attempt↔슬롯 매핑은 attempts에 컬럼을 안 두고 `hosted.slots.attempt_id`(UNIQUE)로만(0004 — slot을 코어 밖으로 격리)
2. 가상키 주입(§3④ attach): exam-ops가 `/key/generate`(예산·만료) → 그 pod에 attach
3. web이 슬롯 `endpoint`(0004 ClusterIP) 또는 pod DNS(`exam-<slot_no>.exam.svc`)로 iframe 역프록시 → code-server는 이미 떠 있어 **즉시 접속**
4. ready 없음 → 대기열("환경 준비 중") + **비동기 풀 보충**(cold path). hot path에서 git-sync·부팅을 기다리지 않음

> **5명 동시 클릭:** `FOR UPDATE SKIP LOCKED`가 5개 서로 다른 슬롯을 보장 — 이중배정은 슬롯 PK `(batch_id, slot_no)`+트랜잭션이 물리적으로 차단(대원칙 ②). 부족하면 N명 배정·나머지 대기. **git 커밋 경로였다면 5개 동시 커밋 충돌·sync 직렬화로 깨진다 → 그래서 할당은 DB.**

### 슬롯 재활용 (비동기 창 모델 B) — attempt 단위 회수
회수가 *회차 종료*가 아니라 **학생 1명 종료마다**: `assigned → submitting`(제출/개별 마감) → 패키징 Job(docs/5 §4: PVC readOnly→tar+sha256→MinIO) **accepted 확정** → `recycling`(PVC wipe+재시드) → `ready`(풀 반납).
- ⭐ **재배정 전 반드시 wipe+재시드** — 이전 학생 작업물 누수 = 부정행위·프라이버시 사고.
- `recycling` 중 배정 금지(상태머신이 강제). 워밍 버퍼가 있으면 다음 학생은 재시드를 안 기다림.
- 상태머신: `down→warming→ready→assigned→submitting→recycling→ready` (0004 실제 = down|warming|ready|assigned; **submitting·recycling은 `0008`이 CHECK에 추가**). pod crash는 슬롯 상태가 아니라 k8s 재시작+PVC 재부착+heartbeat로 처리.
- **모델 A(동시 버스트)는 이 경로를 안 탄다** — 전원 동시 1회 실행이라 회수는 회차 종료의 일괄 scale-down+재시드(§6 [close]). 즉 **B 엔진을 만들면 A는 "재활용 생략 + 풀=명부 + 공유 마감" 설정**으로 떨어진다.

### 비동기 창(B) 운영 잔여 — 구현 전 확정 (Phase 3)
B 엔진은 골격만 잡혔고, 아래 정책은 코드 전에 확정해야 한다:
- **입장 큐**: ready 슬롯 0일 때 대기 순서·취소·타임아웃 + **창 밖 입장 차단**(`window_start_at`/`window_end_at`)·로스터 admission.
- **idle reclaim**: `last_heartbeat_at` 임계값 초과 → 슬롯 회수(작업물은 PVC/스냅샷 보존). grace·재진입 정책 포함.
- **워밍 버퍼 보충 주체**: 누가 ready 수를 감시해 풀(`capacity`/cold path)을 보충하나 — exam-ops 임계값 트리거.
- **다일 창 문제 유출**: B는 §8 변형 뱅크(유형당 ≥3)를 **필수**로 — 초반 응시자→후반 유출 차단(A는 동시라 완화됨).
- **0007 제약 강화**: `mode='window'`면 `window_start_at`·`time_limit_seconds`를 필수화하는 조건부 CHECK를 **B 코드 도입 시** 추가(지금 넣으면 현 batch 생성이 깨짐 — 그래서 0007은 약한 제약으로 둠).

---

## 7. 자원 산정 (동시 50 = bounded burst)

AI 추론은 **클러스터 밖**(Anthropic). 클러스터는 IDE + 학생 코드 실행만 → 가볍다.

| | requests(보장) | limits(피크) |
|---|---|---|
| 학생 1명 | 0.5 vCPU / 1.5 GB | 2 vCPU / 4 GB |
| **50명 합** | **25 vCPU / 75 GB** | 100 vCPU / 200 GB |

- 권장 풀: 사용가능 **~30 vCPU / ~90 GB**(예 16/64 노드×3). 학생 pod 전용 노드 taint/toleration 분리.
- 스토리지 PVC **2~5GB×50**=100~250GB. **사전 워밍 5~10개**로 동시 시작 체증 흡수. 평시 replicas=0.
- **모델 B(비동기 창) 산정:** 합산 기준 = 50이 아니라 **피크 동시 인원**. 명부가 커도 풀=피크+워밍 버퍼면 된다. ⚠️ 단 **이득은 입장이 흩어질 때만** 실현 — 전원이 개창 즉시 몰리면 B도 피크=명부라 A와 동일(차이는 큐로 흡수). 동기 고배점 시험은 *공정성*(동일 제한시간·문제유출 차단) 때문에 일부러 A로 둘 수도 있다(운영 정책).

---

## 8. 보안 + 부정행위 방지 (→ reference/[05](./reference/05-security.md))

**trust='verified'의 전제** (proxy라고 무조건 신뢰 아님):
- **egress allowlist**: 학생 pod 인터넷 차단, **프록시 + 패키지 레지스트리(npm/pypi)만**(`NetworkPolicy`). 외부 AI·검색 차단.
- **대화 = 프록시 강제**: claude code는 `BASE_URL`로만, 우회 경로 없음.
- **산출물 = 서버측 패키징**: 제출 시 사이드카/Job이 `/workspace`를 서버에서 tar+해시 → `submission_files(artifact, sha256)`. 클라가 못 바꿈.
- **trust는 서버가 어댑터 신원으로만 산출**(클라 입력 금지).
- pod 하드닝: non-root, seccomp, read-only rootfs 가능 영역, limits. 더 필요 시 학생 노드만 gVisor.

**부정행위 방지:**
- **문제 유출(2대학 순차):** 유형 고정·데이터/시나리오만 바꾼 **변형 뱅크**(유형당 ≥3). §4 경우 B로 학생별 변형.
- **채팅 위조:** 방어 = ① 결과물도 통과해야(객관층) ② **타이밍/상호작용 분석** — 진짜 협업은 왕복, 붙여넣기는 t=0 대형 프롬프트.
  리포트가 "세션당 메시지 수·비판적 후속질문"을 보니 위조가 결과까지 통과하며 자연스럽기 어렵다. (호스팅 프록시 캡처는 서버가 대화를 직접 산출하므로 `trust='verified'`.)
- **학생 간 표절:** 채팅·산출물 유사도 비교.

---

## 9. (폐기됨) 어댑터 B — byod

> ⚠️ **BYOD는 폐기됐다.** 전달방식은 hosted 단일이다. 과거 이 섹션이 다루던 "본인 PC 풀이 + 외부 스크립트 추출 + 업로드 검증" 경로는 더 이상 제공하지 않는다(코드·스키마에서 전면 제거). 제출은 호스팅 프록시 캡처가 정규화 포맷으로 직접 채운다(§10).

---

## 10. 정규화 포맷 계약 (제출의 공통 입구, linchpin)
호스팅 프록시가 **이 모양**으로 캡처해야 평가이 캡처 경로와 무관하게 한 포맷만 소비한다.
```jsonc
{ "version":1, "tool":"claude-code", "model":"...",
  "messages":[ {"id":"...","index":0,"role":"user|assistant","content":"...","ts":"...","tool_calls":[...],"attachments":[...]} ],
  "meta":{ "attemptId":"...","source":"proxy","sourceHash":"sha256:..." } }
```
- **v1 JSON Schema 별도 파일 고정**(`contracts/chat-log.v1.json`) + **accepted/rejected fixture + contract test(CI)** = P0.
  프록시 출력이 이 스키마로 검증돼야 accepted. (후속)평가 모듈은 이 한 포맷만 소비.

---

## 11. 생명주기·장애 복구

> 스토리지 계층(PVC/MinIO/Postgres)·제출 파이프라인·재접속 안전망 상세는 [5-storage-submission-pipeline.md](./5-storage-submission-pipeline.md).

- **작업 보존:** `/workspace`=PVC, N분 자동저장. pod crash→k8s 재시작→같은 PVC 재부착.
- **seeder 크래시 안전:** 부팅 시 `/workspace`에 `.attempt-<id>.lock` 있으면(크래시 재기동) **wipe 금지·재개**, 없으면 `rm -rf && unpack && touch .lock`.
- **취합 순서 불변:** 제출/마감→submission `accepted` 확정→**그 다음** scale-down. 역순 금지.
- **초기화:** scale-down은 PVC 안 지움 → 다음 부팅 seeder가 wipe+재시드. 진행중 attempt는 보호.
- **관측:** 모든 전이를 `exam.attempt_events`(started/heartbeat/crash/reconnect/uploaded/submitted) append.

---

## 12. S1 Docker 스파이크 — 구체 구성 (이번 주 바로 실행)

네 PC엔 **Docker만**. 컨테이너 1~2개로 핵심 루프를 증명.

```yaml
# docker-compose.yml (개념)
services:
  proxy:        # LiteLLM — 우리 키로 Anthropic 호출 + 전 요청/응답을 attempt_id로 파일/DB 저장
    image: ghcr.io/berriai/litellm
    environment: [ANTHROPIC_API_KEY=..., LITELLM_LOG_DIR=/logs]
    volumes: ["./logs:/logs"]
  exam:         # code-server + claude code + seeder
    build: ./exam-image            # Dockerfile: code-server + node/python + npm i -g @anthropic-ai/claude-code
    environment:
      - ANTHROPIC_BASE_URL=http://proxy:4000
      - ANTHROPIC_API_KEY=dummy-or-attempt-token
      - ATTEMPT_ID=spike-1
      - PROBLEM_ID=planning-2026-09-A
    entrypoint: ["/seed-and-start.sh"]   # PROBLEM_ID로 scaffold를 /home/coder/project에 풀고 code-server 기동
    volumes: ["workspace:/home/coder/project"]
    ports: ["8080:8080"]
volumes: { workspace: {} }
```
- **성공 기준:** 브라우저 `:8080`에서 VS Code → 터미널서 claude code로 코딩 → `./logs`에 **대화 전량이 attempt_id로 저장** →
  `PROBLEM_ID`만 바꿔 재기동하면 **다른 문제가 들어와 있음**. 이게 되면 ①②③ 세 문제가 동시에 죽은 증거.
- S1엔 PVC/슬롯/스케일 불필요(개념만 docker volume로 흉내). S2에서 docker→k8s 매니페스트로 단어만 바뀐다.

---

## 13. 관리자 대시보드 — 시험 준비 + 중앙 관제

운영자가 클러스터·DB를 직접 만지지 않고 시험을 준비·관제하는 단일 화면(앱의 admin 영역). 모든 상태의 정보원은 DB(§11),
액션은 exam-ops·게이트웨이 API로 수행. 스키마·저장 상세는 [5-storage-submission-pipeline.md](./5-storage-submission-pipeline.md).

**A. 시험 준비(회차 생성)**
- **문제 등록**: scaffold/hidden을 problem-registry(MinIO)에 올리고 `PROBLEM_ID` 부여(§4). hidden은 서버 전용 버킷.
- **회차(batch) 구성**: test 선택 · 로스터(응시자) 배정 · 시작/마감(`deadline_at`) 일정 · capacity · 모델·attempt 예산.
- **"회차 열기"** → exam-ops가 §6 GitOps로 0→50 + attempt별 가상키 발급 준비.

**B. 중앙 관제(실시간)**
- **슬롯 현황**: ready/active/crash (heartbeat 기준 — §3④·§6 健康 3층).
- **학생별 진행**: 접속·남은시간·재접속(reconnect) — `attempt_events`(§11).
- **비용**: 가상키별 spend·rate(LiteLLM Admin UI/`/key/info`), 회차 합계.
- **운영 액션**: 개별 **시간 연장**(`deadline_at` 갱신) · **강제 제출** · 재접속 도움.

**C. 사후**
- 제출 현황(received→accepted) · 채점 큐(`grading.jobs`) · 결과·trust.

> ⭐ 관제의 단일 근거는 **앱 heartbeat**(k8s 직접 접속 회피, §6). 대시보드는 DB를 읽고, 변경은 서버 API로만.

---

## 체크리스트 (단계 게이트)
- [ ] **S1**: 위 compose로 1인 루프 + 대화 저장 + `PROBLEM_ID` 교체 주입 확인 (Docker만)
- [ ] **정규화 포맷**: JSON Schema v1 + validator + accepted/rejected fixture + contract test(CI) — 프록시 캡처가 이 계약을 만족(§10)
- [ ] **S2**: exam-ops git 커밋→ArgoCD sync→heartbeat 폴링→배정→취합→replicas=0, **50 동시 리허설** 통과 (매니페스트 초안: [3-s2-k8s-skeleton.md](./3-s2-k8s-skeleton.md) · 시스템팀 공유용 운영 개요: [4-exam-serving-overview.md](./4-exam-serving-overview.md))
- [ ] 문제: scaffold/hidden 분리, 변형 뱅크(유형당 ≥3), 경우 A(부팅 시드) 우선·경우 B(attach 변형) 준비
- [ ] 보안: egress allowlist, 프록시 강제, 서버측 artifact 해시, trust 서버산출, 부정행위 3종 방어
- [ ] 복구: sync 실패/슬롯 부족 시 재배포·일정조정으로 회복되는지 검증
- [ ] (S3 동적 오케스트레이터 + SA RBAC은 동시 batch가 50 초과로 실제 필요해질 때만)
