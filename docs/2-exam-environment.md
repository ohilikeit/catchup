# 2. 시험 환경 — 제공 어댑터 인프라

> 목적: [1-web-platform-planning.md](./1-web-platform-planning.md) §5 **제공 어댑터**의 구현 상세. 계약은 하나 —
> "attempt에 대해 **accepted된 정규화 Submission**을 만든다." 코어(1번)는 이 문서를 *모른다*; 어댑터는 갈아끼울 수 있다.
> 전제: **사내망 + 기존 k3s + ArgoCD(GitOps), 직접 kubectl 불가, 동시 최대 50명/회차, 실험 단계.**
> 근거: reference/[02](./reference/02-db-schema.md)·[03](./reference/03-cache.md)·[05](./reference/05-security.md)·[09](./reference/09-optimization.md).

## 핵심 한 줄
**어댑터 A(hosted)=사내망 k3s 위 학생별 격리 컨테이너(code-server) + LLM 프록시 캡처, GitOps로 0↔50 스케일(직접 kubectl 없음).
어댑터 B(byod)=본인 PC + 외부 스크립트 + 업로드 검증. 둘 다 같은 정규화 포맷으로 submission을 채우고, B는 항상 안전망.**

---

## 0. 세 문제 → 한 결정, 그리고 단계별 가능성 확인

운영상 세 문제(① 유료 AI 툴 제공 ② 시험 환경 ③ 채팅 수집)는 **"환경을 우리가 호스팅하는가"** 한 축으로 묶인다.
호스팅하면: ① 우리 API 키, ② 격리 컨테이너, ③ 프록시가 대화 자동 저장 — **세 개가 동시에 죽는다.** 못 가면 B(byod).

각 단계는 다음으로 넘어가기 전 **go/no-go 기준**이 있다. 막히면 어댑터 B로 출시(코어 무변경).

| 단계 | 목표 | 통과 기준(go) | 필요한 것 |
|---|---|---|---|
| **S1 로컬 Docker 스파이크** | 어댑터 A 핵심 루프 증명 | 학생 1명: 브라우저 code-server→claude code 풀이 → **대화 전량 프록시 저장** → 산출물 회수 → 정규화 submission 1건. `PROBLEM_ID` 교체로 다른 문제 주입 확인 | **Docker만**(VM 1대). k3s/ArgoCD 불필요 |
| **S2 사내망 k3s 스케일 풀** | 동시 50 운영 | **50개 동시 리허설**: 프로비전→배정→캡처→취합→scale-down→재시드 초기화 | k3s+ArgoCD(git만), 오브젝트 스토리지 |
| **S3 동적 오케스트레이터** | 동시 batch가 50 초과 | (필요해질 때) per-attempt 생성/회수 | ServiceAccount RBAC(ArgoCD로 1회 부여) |
| **B 상시** | 안전망 | validator/fixture 통과, 업로드→accepted | (스크립트는 외부 제공) |

> ⭐ S1은 **네 PC에 k3s/ArgoCD를 깔 필요가 없다** — 클러스터 정치와 무관하게 가장 빨리 배운다. S1에서 만든
> 이미지·프록시·seeder가 S2/S3에 그대로 재사용된다. **B(byod)는 S1과 병렬 상시 준비.**

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

---

## 3. 어댑터 A 구성요소

```
학생 브라우저 ─iframe(앱 프록시)→ [code-server] ─내부→ [claude code] ─(ANTHROPIC_BASE_URL)→ [LLM 프록시] → api.anthropic.com
                                     │ /workspace(PVC)                                          │ 우리 키·로깅(유일 egress)
                                     │ initContainer(seeder)                                    ▼
                                     └ 부팅 시 self-register/heartbeat → 앱            정규화 → submission(proxy, verified)
```

**① 컨테이너 이미지(고정, 문제와 분리)** — base: code-server + 런타임 + **claude code 프리설치**. entrypoint=seeder.
env: `ANTHROPIC_BASE_URL=<프록시>`, `ANTHROPIC_API_KEY=<우리키/attempt 토큰>`, `ATTEMPT_ID`, `PROBLEM_REF`.
**② LLM 프록시(LiteLLM 등)** — 우리 키 단일 호출, **요청/응답 전량을 `attempt_id`로 로깅**→정규화→`submission_files(chat_log)`.
attempt별 비용상한·rate limit, 제출/만료 시 토큰 폐기. 해시캐싱은 reference/03.
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

동시-창 모델(50명 한 창)이라 **수요 모양 = 창 동안 50, 그 외 0.** 그래서 **per-student 동적이 아니라 풀 단위 0↔50**이 정답.

평시 `replicas:0`(자원 0), 창 30분 전 0→50, 종료 후 50→0. **누가 올리고 내리나**(성숙도 순):

| 방식 | 어떻게 | 자동화 | 적합 |
|---|---|---|---|
| **수동 GitOps** | 시험 전 `replicas:50`+`PROBLEM_ID` 커밋→ArgoCD sync, 끝나면 `0` | ✕ | **실험·초기**(추천 시작) |
| 앱→ArgoCD API | exam-ops가 ArgoCD API로 param sync 호출 | ○ | 회차 잦아질 때 |
| 스케줄러/KEDA | 시험 일정 따라 자동 | ○○ | 운영 성숙기 |

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

```
[T-30m 회차 open]
 exam-ops: 목표상태(replicas=capacity, PROBLEM_ID=problem_version, delivery=hosted) → env-overlays/batch-<id>.yaml 커밋&푸시
   → ArgoCD sync → StatefulSet 0→50, initContainer(seeder) 실행 → pod self-register/heartbeat
 exam-ops: ready 슬롯 ≥ 로스터 인원까지 폴링(**heartbeat 기준 — k8s API 불필요**) → batch.status='open'
[진행] 앱이 ready 슬롯 배정·iframe 프록시. 제한시간 = attempts.deadline_at 서버 강제
[close] 모든 submission accepted 확인(**취합 먼저!**) → replicas=0 커밋 → scale-down. PVC 잔존, 다음 부팅 seeder가 초기화
[폴백] sync 실패 / 마감까지 ready 부족 → exam-ops가 batch.delivery_mode='byod' 전환·공지 → 어댑터 B로 진행
```
- **健康 3층:** ArgoCD(Synced/Healthy=배포 realized) + k8s probe(개별 pod 자동치유) + **앱 heartbeat(배정 가능?)**.
  런타임 정상 판정은 **ArgoCD 아님** — heartbeat가 단일 근거(k8s 접속 회피).
- **폴백 트리거가 핵심:** 호스팅 실패는 전부 "BYOD 강등"으로 수렴 → 출시 리스크 0.

---

## 7. 자원 산정 (동시 50 = bounded burst)

AI 추론은 **클러스터 밖**(Anthropic). 클러스터는 IDE + 학생 코드 실행만 → 가볍다.

| | requests(보장) | limits(피크) |
|---|---|---|
| 학생 1명 | 0.5 vCPU / 1.5 GB | 2 vCPU / 4 GB |
| **50명 합** | **25 vCPU / 75 GB** | 100 vCPU / 200 GB |

- 권장 풀: 사용가능 **~30 vCPU / ~90 GB**(예 16/64 노드×3). 학생 pod 전용 노드 taint/toleration 분리.
- 스토리지 PVC **2~5GB×50**=100~250GB. **사전 워밍 5~10개**로 동시 시작 체증 흡수. 평시 replicas=0.

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
- **채팅 위조(BYOD 특히):** 방어 = ① 결과물도 통과해야(객관층) ② **타이밍/상호작용 분석** — 진짜 협업은 왕복, 붙여넣기는 t=0 대형 프롬프트.
  리포트가 "세션당 메시지 수·비판적 후속질문"을 보니 위조가 결과까지 통과하며 자연스럽기 어렵다. ③ `trust='unverified'` 표기.
- **학생 간 표절:** 채팅·산출물 유사도 비교.

---

## 9. 어댑터 B — byod (안전망)

```
학생: exam/[id] → scaffold 다운로드(signed URL, public만) → 본인 PC 풀이
   → (외부 제공 .sh)로 대화 정규화 추출 → 대화+산출물 업로드 → 제출
서버: 검증 → submission(upload, unverified) status: received→validating→accepted/rejected
```
- 검증(플랫폼 P0): **JSON Schema v1** + 크기/MIME + sha256 + 아카이브 안전(폭탄·경로탈출 차단).
- 스크립트 구현은 외부(코드와 함께 전달)지만 **출력 계약 검증은 플랫폼 책임**. 추가 인프라 0. S1과 병렬 우선.

---

## 10. 정규화 포맷 계약 (공통 입구, linchpin)
두 어댑터가 **같은 모양**을 뱉어야 평가이 제공 방식과 무관.
```jsonc
{ "version":1, "tool":"claude-code", "model":"...",
  "messages":[ {"id":"...","index":0,"role":"user|assistant","content":"...","ts":"...","tool_calls":[...],"attachments":[...]} ],
  "meta":{ "attemptId":"...","source":"proxy|export-script","sourceHash":"sha256:..." } }
```
- **v1 JSON Schema 별도 파일 고정**(`contracts/chat-log.v1.json`) + **accepted/rejected fixture + contract test(CI)** = P0.
  프록시 출력·BYOD 업로드 **둘 다 이 스키마로 검증**해야 accepted. (후속)평가 모듈은 이 한 포맷만 소비.

---

## 11. 생명주기·장애 복구
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

## 체크리스트 (단계 게이트)
- [ ] **S1**: 위 compose로 1인 루프 + 대화 저장 + `PROBLEM_ID` 교체 주입 확인 (Docker만)
- [ ] **B**: JSON Schema v1 + validator + accepted/rejected fixture + 업로드 UI → submission accepted (S1과 병렬, 먼저)
- [ ] **S2**: exam-ops git 커밋→ArgoCD sync→heartbeat 폴링→배정→취합→replicas=0, **50 동시 리허설** 통과
- [ ] 문제: scaffold/hidden 분리, 변형 뱅크(유형당 ≥3), 경우 A(부팅 시드) 우선·경우 B(attach 변형) 준비
- [ ] 보안: egress allowlist, 프록시 강제, 서버측 artifact 해시, trust 서버산출, 부정행위 3종 방어
- [ ] 폴백: sync 실패/슬롯 부족 시 `delivery_mode='byod'` 자동 강등 검증
- [ ] (S3 동적 오케스트레이터 + SA RBAC은 동시 batch가 50 초과로 실제 필요해질 때만)
