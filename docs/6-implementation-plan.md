# 6. 구현 계획 — 최종 시험 환경 구축 로드맵

> 목적: [2](./2-exam-environment.md)(설계)·[3](./3-s2-k8s-skeleton.md)(k8s)·[4](./4-exam-serving-overview.md)(운영)·[5](./5-storage-submission-pipeline.md)(스토리지)를
> **무엇을·어떤 순서로 만들지** 하나의 실행 계획으로 종합. 각 항목은 위 문서를 레퍼런스로 가리킨다.
> 전제: 사내 k3s + ArgoCD, 동시 50명/회차, 진짜 키 1개(게이트웨이 보관), 공식 MinIO 사용.
> 환경 3계층(§0.5): **local**(k3d, 2~5명 기능 확인) → **alpha**(사내, 실 GitOps 파이프라인) → **prod**(50 동시). harbor는 alpha/prod 전용(로컬 우회).

## 핵심 한 줄
**S1(로컬 Docker)에서 핵심 루프는 검증 완료. 이제 ① 플랫폼 코어(DB·MinIO·앱 셸·대시보드) → ② S2 k8s 편입 →
③ exam-ops 자동화 → ④ 50 동시 리허설 순으로 쌓는다. 전달방식은 hosted 단일(BYOD는 폐기).**

> 🟢 **갱신 (2026-06-10)** — **Phase 3 로컬판(exam-ops 자동화) 핵심 구현**:
> ① **슬롯별 라우팅/격리**: provision이 `/exam-ide/{slotNo}` Ingress(exam-ide-slots) + pod 고정 Service(exam-slot-N, `statefulset.kubernetes.io/pod-name`)를 동적 생성, [exam-authz](../apps/web/app/api/internal/exam-authz/route.ts)가 **경로의 슬롯 번호 == 그 유저의 배정 슬롯**(X-Forwarded-Uri) 대조 — 학생 A→B pod 차단(구판 app=exam 라운드로빈 `exam-direct` 폐기).
> ② **가상키 주입**: provision이 슬롯당 `/key/generate`(max_budget=`batches.llm_budget_usd`·duration 24h) → Secret `exam-virtual-keys` → pod 기동 래퍼가 자기 ordinal 키만 `ANTHROPIC_AUTH_TOKEN` export([`0012`](../db/migrations/0012_slot_virtual_key.sql) slots.virtual_key 보관 → close 시 revoke).
> ③ **회차 트리거 web 이관**: 대시보드 "시험 환경 열기/회차 종료" 버튼 = [`examOpsService`](../apps/web/lib/services/examOpsService.ts)가 **k8s API 직접 호출**(web ServiceAccount RBAC, [`lib/k8s`](../apps/web/lib/k8s/client.ts)). provision = 가드(진행 중 슬롯 거부)→가상키→**PVC wipe**(작업물 누수 0)→ConfigMap/Secret→0→N→슬롯 라우팅→슬롯 register. GitOps 커밋 방식(§5.4)은 alpha부터 — k8s 호출부만 교체.
> ④ **제출물 회수(작업물+채팅, 2026-06-10 확장)**: 제출/강제제출 → **패키징 Job**이 PVC에서 `project/`(작업물)·`claude/`(Claude Code 대화 JSONL — PVC subPath로 영속화, pod 재시작에도 보존)를 각각 tar+sha256 → MinIO → internal 콜백이 submissions(accepted·trust=verified)+submission_files(`artifact`·`chat_log`) 등록, 슬롯 submitting→recycling. **키는 사람이 읽는 경로**: `exam-artifacts/{회차명}/{학생명_이메일-attempt8}/workspace.tgz`·`exam-chatlogs/…/chatlog.tgz`(uuid 나열 금지). fail-soft — 패키징 실패가 제출을 막지 않음.
> ⑤ **close 슬롯 상태머신**: close 시 슬롯 전부 down + 가상키 revoke + 슬롯별 라우팅 제거. ⑥ **ConfigMap 처리**: 회차 문제(SCAFFOLD_REF)를 provision이 DB에서 해석해 갱신. `exam-ops.sh`는 internal route(`/api/internal/exam-ops/*`) 얇은 래퍼로 전환.
> 잔여(로컬): **재접속 복귀**(1c)·**spend 관제**(1d)·**마감 자동 스윕**(deadline 만료 일괄 회수)·비동기 창(B) 재활용·운영모드 플래그. ⚠️ 단일 StatefulSet+단일 ConfigMap 구조라 **동시 활성 회차 1개**(provision 가드가 강제).
> ✅ **k3d 실검증 완료(2026-06-10)**: provision(가상키 2개 발급→pod별 `ANTHROPIC_AUTH_TOKEN` 주입 일치 확인→시드→슬롯별 Service/Ingress→슬롯 ready) → 비로그인 `/exam-ide/0/` 401 → 패키징 Job(tar+sha256→MinIO→콜백→submissions accepted·verified+artifact 행+`artifact_packaged` 이벤트+슬롯 recycling) → close(키 2개 revoke·라우팅/Secret 삭제·replicas 0·슬롯 down) 전 사슬 동작.
> ⚠️ **ArgoCD 자동 sync(selfHeal) 일시 해제 상태** — 로컬 manifest 변경(30-web RBAC·40-exam 래퍼·55 미들웨어)이 exp 미푸시라 selfHeal이 되돌리는 문제로 검증 중 해제함. **exp push 후 복원**: `kubectl -n argocd patch application catchup-local --type merge -p '{"spec":{"syncPolicy":{"automated":{"prune":true,"selfHeal":true}}}}'`
>
> 🟢 **갱신 (2026-06-09)** — **로컬 k3d 전 루프 e2e 검증 완료**. `./setup.sh` 한 번으로 k3s(k3d)+ArgoCD+MinIO+DB+LiteLLM+web 기동(단일 `.env.secret`),
> 4개 ingress(`catchup`/`litellm`/`minio`/`argocd`.localhost). **hosted 시험 루프 실증**: 문제 업로드(`/api/internal/problems/upload`→MinIO, DB는 ref) →
> exam pod seeder가 MinIO에서 scaffold pull(initContainer mc+tar) → exam-ops가 슬롯 register → 학생 로그인→시작→**슬롯 원자배정(SKIP LOCKED)**→
> web 역프록시가 code-server 도달(302)→제출까지 전 사슬 동작. Phase 2b 아티팩트(`bitbucket-pipelines.yml`·`catchup-helm/SECRETS.md`) 작성(실행은 사내).
> 추가 구현: **문제 업로드 automation**(`/api/internal/problems/upload`, scaffold→MinIO·DB=ref) · **exam-ops 최소판**(`deploy/local-k3d/exam-ops.sh` provision: replicas N + 슬롯 register) ·
> **회차 학생 1명 추가 + 임시비번 평문 관리자 조회**(0011, admin 회차상세). **2b 아티팩트**(`bitbucket-pipelines.yml`·`catchup-helm/SECRETS.md`, 실행은 사내).
> 잔여(로컬): exam-ops 자동화 본체(0↔N 자동 트리거·워밍 버퍼·SKIP LOCKED 큐·재활용 PVC wipe)·패키징 Job·마감 스윕(Phase 3).
>
> 📌 **현황 (2026-06-08 코드 대조)** — 코어의 *로컬 완결 가능 부분*은 계획보다 앞서 있다.
> **DB 스키마**(exam·hosted·ops)·**대시보드**(회차 개설·로스터 import·스코프)·**MinIO 실물 저장**(lib/storage·버킷·서버 sha256)·**문제 업로드**(scaffold/hidden→MinIO)는 구현 완료 — **로컬 완결 가능한 코어는 사실상 끝났다.**
> 남은 코어는 **hosted iframe 프록시**(현재 "준비 중" 플레이스홀더, k8s 의존)와 **litellm DB 흡수**. 그 위로 **k8s/Helm/ArgoCD·exam-ops 자동화는 전무**다.
> ⚠️ **BYOD 폐기로 hosted가 유일한 제출 경로** → Phase 2(hosted 런타임)·Phase 3(패키징 Job 제출)이 critical-path.
> ✅ **로컬 전략 (환경 3계층, §0.5)**: 로컬 **k3d**(Docker 위 k3s) + ArgoCD로 alpha와 *거의 동일한* 환경을 꾸려 **소수(2~5명) 기능 검증**까지 끝낸다 —
> Helm chart·StatefulSet·iframe 프록시·MinIO·게이트웨이 전 루프가 로컬에서 돈다. harbor는 **로컬에서 우회**(`k3d image import`).
> **alpha부터** 실제 bitbucket→harbor→ArgoCD 파이프라인으로 배포·StatefulSet 스케일을 검증하고, **50 동시 규모·실부하는 prod 전용**(단일 머신 물리 한계). 갈래별 상태는 각 Phase 표기 참조.

---

## 0. 컴포넌트 인벤토리 (최종 환경)

| 컴포넌트 | 역할 | 상태 | 참조 |
|---|---|---|---|
| exam 이미지 | code-server + claude code(+확장) + seeder | ✅ S1 완료 | [README](../experiments/s1-docker-spike/README.md) |
| LiteLLM 게이트웨이 | 진짜 키 보관·`*`→Sonnet·가상키·spend | ✅ S1 완료 | 2 §3, 3 §2 |
| 가상키 발급 | `/key/generate` 자동(예산·만료) | ✅ S1 완료 | 2 §3, 3 §3 |
| **web 앱 셸** | 상단바(타이머·제출)+iframe 프록시 | 🟡 셸 골격 완성·hosted iframe 미구현 | 2 §2, 4 |
| **관리자 대시보드** | 시험 준비·중앙 관제·운영 액션 | 🟡 회차개설·로스터·운영액션 구현 / spend 관제 대기 | 2 §13, 4 |
| **DB 스키마** | batches/attempts/slots/submissions | ✅ `0003_exam`·`0004_hosted`·`0005_ops` | 5 §3 |
| **litellm DB 흡수** | 가상키·spend 저장 (S1 별도 `litellm-db` → 메인 postgres) | 🟡 로컬 완결(메인 postgres 내 `litellm` 전용 DB·게이트웨이 compose profile) / prod 시크릿 배선은 Phase 2b | 3 §0·§7 |
| **MinIO 버킷** | scaffold/hidden/artifacts/chatlogs | ✅ lib/storage·compose·setup.sh 부트스트랩 (전부 private) | 5 §2 |
| **문제 업로드** | scaffold/hidden → MinIO + problem_versions | ✅ admin 폼·problemService(서버 sha256) | 5 §2 |
| **제출 파이프라인** | 서버측 패키징 Job(hosted) + 마감 자동 회수 | 🟡 패키징 Job 구현(제출/강제제출 트리거→MinIO→DB 등록) / 마감 스윕 ⬜ | 5 §4·§7 |
| **exam-ops** | 가상키 발급·0↔50 스케일·마감 스윕 | 🟡 로컬판 구현(examOpsService: provision/close·가상키·슬롯별 라우팅·PVC wipe) / GitOps 트리거·마감 스윕 ⬜ | 2 §6, 3 §5 |
| k8s 매니페스트 | web/litellm/exam/networkpolicy/argocd | ⬜ 작성 | 3 |
| **catchup-helm 레포** | Helm chart + values + batch overlay (ArgoCD watch) | ⬜ 생성 | 3 §5.1 |
| **자동 회차 트리거** | exam-ops가 catchup-helm 커밋 → ArgoCD sync | ⬜ 구현 | 3 §5.4 |

---

## 0.5 환경 3계층 (local / alpha / prod) — k8s·GitOps 전략

**같은 Helm chart 1벌에 values 파일만 갈아끼운다**(GitOps 정석). 환경 차이는 전부 values에 격리 →
로컬에서 검증한 chart가 *바이트 단위 동일*하게 alpha→prod로 승급된다. "로컬에선 됐는데 사내에선 안 됨"의
표면적이 capacity·정책·레지스트리로 좁혀진다.

**역할 분담**:
- **local (k3d, 2~5명)**: alpha와 *거의 동일한* 환경을 로컬에 꾸려 **기능 검증만**. Helm·StatefulSet·iframe 프록시·MinIO·게이트웨이 전 루프 확인. **bitbucket pipeline은 안 돌림** — 이미지는 `k3d image import`로 직접 주입, 배포는 `helm`/로컬 ArgoCD로 직접.
- **alpha (사내, 점진)**: **여기부터 실제 GitOps 파이프라인** — bitbucket push → harbor → ArgoCD auto-sync. StatefulSet을 실제로 **올렸다 내렸다**(replicas 0↔N) 하며 회차 트리거·취합·scale-down을 검증. 중간 규모(10~20).
- **prod (사내, 50 동시)**: 50 규모·실부하·Anthropic Tier·노드풀·사전워밍. **단일 머신 물리 한계로 로컬 불가**한 것들 전용.

**환경별 차이 축**:

| 축 | local (k3d, 2~5명) | alpha (사내, 점진) | prod (사내, 50 동시) |
|---|---|---|---|
| 이미지 출처 | `k3d image import`(레지스트리 우회) | **harbor** (bitbucket pipeline) | **harbor** |
| 배포 방식 | `helm` 직접 / 로컬 ArgoCD | **ArgoCD auto-sync (실 파이프라인)** | ArgoCD auto-sync |
| `capacity`/replicas | 2~5 | 10~20 | 50 |
| requests/limits | 축소(머신 한계) | 실측치 | 실측치 + 사전워밍 5~10 |
| NetworkPolicy | **off**(생략) | on (k3s 내장 컨트롤러) | on (+필요시 Calico) |
| storageClass | `local-path`(k3s 기본) | 사내 SC | 사내 SC + 노드풀 taint |
| 시크릿 | 평문 `.env.secret` | SealedSecrets | SealedSecrets |
| Anthropic | 게이트웨이 동일 | 동일 | Tier 산정·실부하 |

**레포/파일 구조** (§5.1 레포 분리):
```
catchup-helm/
  charts/exam-platform/        # chart 1벌 (환경 불변)
  values/
    local.yaml                 # k3d 소수 검증
    alpha.yaml                 # 사내 점진(실 파이프라인 시작점)
    prod.yaml                  # 50 동시
  batches/current.yaml         # exam-ops가 커밋하는 회차 상태(replicas 0↔N)
```
- harbor는 **로컬에 복제하지 않는다** — 가치(스캔·RBAC·서명)가 소수 검증엔 불필요하고 WSL2에 무겁다. local은 레지스트리를 건너뛴다.
- NetworkPolicy: 로컬은 off로 둬도 기능 검증에 지장 없음. k3s는 flannel이어도 NP 컨트롤러를 **내장**하므로 alpha/prod에서 추가 설치 없이 켤 수 있다(Calico는 더 강한 정책이 필요할 때만).

---

## Phase 0 — S1 로컬 검증 ✅ (완료)

- [x] exam 이미지 빌드(code-server·claude code·확장 프리설치), crash-safe seeder
- [x] LiteLLM 게이트웨이 + 가상키 자동 발급, `*`→Sonnet 강제(실측: `Received Model Group=claude-sonnet-4-5`)
- [x] 진짜 키로 **인증 통과** 확인(크레딧 400 = 성공), 컨테이너엔 가상키만
- [x] `PROBLEM_ID` 교체 문제 주입(ainc2026 xlsx md5 일치), hidden 미포함
- [x] 자원 cgroup 제한 실측(2cpu/4g, ~198% cap), 재접속·작업물 보존(PVC 흉내)
> 산출물: `experiments/s1-docker-spike/` (이미지·게이트웨이·스크립트가 S2에 그대로 재사용)

---

## Phase 1 — 플랫폼 코어 (DB · MinIO · 앱 셸 · 대시보드)

**의존: 없음(S1 산출물 위에서 시작). 가장 먼저.**

### 1a. DB 스키마 (정보원) — 레퍼런스 [5 §3] — ✅ **사실상 완료**
- [x] `db/migrations/00NN_*.sql`: `hosted` schema, `exam.batches`, `exam.attempts`(batch_id·deadline_at), `exam.attempt_events`, `hosted.slots` → [`0003_exam.sql`](../db/migrations/0003_exam.sql)·[`0004_hosted.sql`](../db/migrations/0004_hosted.sql) (BYOD 폐기로 `delivery_mode`는 [`0009_drop_byod.sql`](../db/migrations/0009_drop_byod.sql)에서 제거)
- [x] `exam.submissions.attempt_id`(UNIQUE 1:1), `exam.submission_files`(kind·ref·sha256·size_bytes·mime)
- [x] 상태 제약·인덱스(examinee_id·status / batch·status)·`updated_at` 트리거 → ⚠️ 계획의 `attempt_status` **ENUM**은 실제로 **CHECK 제약**으로 구현(`ready/running/submitted/expired/void`, 기능 동등). `hosted.slots`·`ops.roster_imports`([`0005_ops.sql`](../db/migrations/0005_ops.sql))도 포함
- [x] 적용·검증: `pnpm db:migrate` (철칙 1·2)
- [x] **litellm DB 흡수** (S1 별도 `litellm-db` 폐기): 메인 postgres에 **litellm 전용 논리 DB `litellm`** 생성([`postgres-init/01-litellm-db.sql`](../db/postgres-init/01-litellm-db.sql) 최초 init + `setup.sh` 멱등 보장) → 게이트웨이 `DATABASE_URL`을 메인 postgres로([`infra/litellm/config.yaml`](../infra/litellm/config.yaml), compose `--profile gateway`). LiteLLM 스키마는 **prisma가 자체 관리**(우리 `db/migrations`와 분리; 실측: 게이트웨이 부팅 시 `litellm` DB에 `LiteLLM_*` 39테이블 생성, `catchup` DB 누수 0). **결정: schema가 아니라 별도 DB**(prisma가 통째 관리 → 백업·마이그레이션 깔끔히 분리, docs/3 §7). ⚠️ prod의 `DATABASE_URL` SealedSecret 배선은 Phase 2b

### 1b. MinIO 버킷·정책 — 레퍼런스 [5 §2] — ✅ **완료**
- [x] 버킷 생성: `exam-scaffold` / `exam-hidden`(서버 전용) / `exam-artifacts` / `exam-chatlogs` (setup.sh 일회성 mc 부트스트랩 + 앱 `ensureBucket` 런타임 안전망)
- [x] 정책: 전부 private(익명 접근 none) — 서버(앱/Job) 자격으로만 접근
- [x] [`lib/storage`](../apps/web/lib/storage/) 래퍼(put·get·서명 URL·서버 sha256·sanitize) + 루트 docker-compose MinIO(bind mount `./data/minio`로 호스트 확인). scaffold/hidden은 문제 업로드(§1d)가, artifacts/chatlogs는 hosted 패키징 Job(Phase 3)이 채운다 (BYOD 폐기로 업로드 제출 경로는 제거)

### 1c. 앱 셸 (학생 화면) — 레퍼런스 [2 §2, 4] — ✅ **셸 + hosted IDE(ForwardAuth) 로컬 검증 완료**
- [x] 시험 페이지 골격: 상단바 + 서버 `deadline_at` 기준 카운트다운([`Countdown.tsx`](../apps/web/app/(exam)/_components/Countdown.tsx)) + hosted 런타임([`ExamRuntime.tsx`](../apps/web/app/(exam)/exam/[attemptId]/ExamRuntime.tsx)) + 마감 처리. 서버 라우트가 status로 intro/done 분기
- [x] **hosted 런타임 구현·로컬 e2e + 브라우저 풀렌더 검증(2026-06-09)**: 학생 로그인→시작→**그 유저 슬롯 배정**→IDE→제출 전 사슬 동작. IDE 접근은 **ForwardAuth 인증 ingress**: `catchup.localhost/exam-ide` → traefik Middleware(forwardAuth=`/api/internal/exam-authz` 세션+running·assigned 슬롯 소유권 검사 → 그 유저만 통과 / stripPrefix) → **code-server 직결**. 같은 도메인이라 세션 쿠키 전달 + traefik→code-server 직결로 **HTML+전체 에셋(workbench.js 16.7MB)+WebSocket(101) 완전 동작**(folders·Claude Code 표시).
  - ⚠️ 채택 경위: `/exam/[id]/ide` web 역프록시(server.mjs WS·route HTTP)는 코드상 정상(pod 직접 101)이나 **k3d traefik↔Next 커스텀서버 WS 업그레이드가 502**(traefik "Peeking first byte i/o timeout") → ForwardAuth(인증 ingress→code-server 직결)로 우회. content-encoding 드롭·날짜 TZ(KST) 하이드레이션도 수정.
  - ~~⚠️ 로컬 단일 pod 권한(그 유저가 진행 중 시험 보유)~~ → ✅ **다중 pod per-student 격리 구현(2026-06-10)**: 슬롯별 경로(`/exam-ide/{slotNo}`) + pod 고정 Service + authz의 슬롯 번호 대조.
- [ ] **재접속 복귀**: 재로그인 → 진행 중 attempt 조회 → 같은 슬롯 재연결(5 §5) — hosted 의존, 미구현

### 1d. 관리자 대시보드 — 레퍼런스 [2 §13, 4] — 🟡 **운영 골격 구현 / 일부 관제 대기**
- [x] 준비: 회차(batch) 생성·로스터 import(xlsx)·스코프 강제(admin 전체 / org_admin 자기 대학) → [`batchService.ts`](../apps/web/lib/services/batchService.ts), `admin/{batches,problems,students,submissions,orgs}`·`org/*` 라우트
- [x] 준비: **문제 업로드(MinIO)** — admin 폼 → server action → [`problemService`](../apps/web/lib/services/problemService.ts)(서버 sha256·scaffold→exam-scaffold·hidden→exam-hidden) → `problem_versions`
- [x] 준비: **일정·예산** — 회차 속성으로 구현(문제버전이 아님): 예정 일시(`batches.scheduled_at`, 회차 개설 폼)·1인당 LLM 예산(`batches.llm_budget_usd`, [`0010`](../db/migrations/0010_batch_llm_budget.sql)·서버검증; 가상키 `max_budget` 적용은 Phase 3 exam-ops). 상세 헤더에 표시
- [ ] 관제: 슬롯 현황(`hosted.slots`)·학생 진행(`attempt_events`)·**spend(/key/info)** — spend는 LiteLLM 게이트웨이 연동 대기
- [x] 액션 골격: 회차 상태전이·시간 연장(`deadline_at`)·무효·**강제 제출**(`canOperate`=admin). 강제 제출은 ready/running→submitted 상태 전이+감사 이벤트([`attemptService.forceSubmit`](../apps/web/lib/services/attemptService.ts)) — ✅ 2026-06-10부터 제출/강제제출 모두 패키징 Job(PVC 캡처→MinIO)을 fail-soft로 트리거

**Phase 1 게이트**: 로컬에서 web 앱이 S1 exam 컨테이너를 iframe 프록시하고, 상단바 타이머·제출이 DB/MinIO에 저장되며, 대시보드로 회차를 만들 수 있다.
> 현황: **대시보드 회차 생성·문제 업로드·MinIO 실물 저장 ✅** (로컬 완결분 완료). 게이트의 잔여 = **iframe 프록시**(로컬 불가, k8s 의존 → Phase 2) + **litellm DB 흡수**. BYOD 폐기로 *유일한 제출 경로가 hosted*라 Phase 2/3가 critical-path.

---

## Phase 2 — S2 k8s 편입 — 레퍼런스 [3]

**의존: Phase 1(코어). S1 이미지·게이트웨이를 k8s로 옮김. 환경 3계층은 §0.5.**
> 현황(2026-06-09): **2a 로컬 k3d 검증 🟢 거의 완료** — `deploy/local-k3d/`(순수 manifest)·`catchup-helm/`(umbrella chart)·로컬 ArgoCD Application·ingress·단일 `.env.secret` 시크릿 렌더·exam seeder(MinIO)·exam-ops(provision/슬롯)·**hosted iframe e2e** 동작. **2b 아티팩트 작성**(`bitbucket-pipelines.yml`·`catchup-helm/SECRETS.md`) — 실행은 사내 harbor/bitbucket 필요(⬜).
> 전략: **2a(로컬 k3d 소수 검증) → 2b(alpha 실 파이프라인)**. 로컬에서 chart·StatefulSet·iframe 루프를 다 확인하고, alpha에서 GitOps 파이프라인을 실제로 돌린다.

### 2a. Helm chart 작성 + 로컬 k3d 검증 (소수, 파이프라인 없이)
- [ ] **레포 분리**: `catchup`(app) / `catchup-helm`(deploy) 생성 (사내 정책, §5.1)
- [ ] **Helm chart화**: raw yaml(docs/3) → `catchup-helm/charts/exam-platform` + `values/{local,alpha,prod}.yaml` + `batches/current.yaml` (§0.5)
- [ ] 학생 pod: `exam` StatefulSet(replicas 0, initContainer seeder, PVC, 하드닝)·headless Service
- [ ] **로컬 k3d 셋업**: k3d 클러스터 + ArgoCD 설치 + MinIO + LiteLLM 게이트웨이. 이미지는 `k3d image import`(harbor 우회), 배포는 `helm`/로컬 ArgoCD 직접
- [ ] **로컬 검증**: `values/local.yaml`로 exam pod 1~2개 띄워 학생 화면 iframe 프록시가 S1과 동일하게 동작(소수). NetworkPolicy는 off

### 2b. alpha 실 GitOps 파이프라인 (여기부터 실제 배포)
- [ ] **bitbucket pipeline**: `catchup` push → 이미지(`catchup-exam`·`catchup-web`·`exam-packager`) 빌드 → **harbor** → `catchup-helm` `image.tag` 자동 bump
- [ ] 시크릿: `litellm-secrets`·`app-secrets`를 SealedSecrets/External Secrets로
- [ ] **ArgoCD Application**: source=`catchup-helm`(helm valueFiles=`alpha.yaml`), 상주 선언 + StatefulSet replicas=0 (§5.3)
- [ ] NetworkPolicy: 학생 pod egress = litellm(4000)+DNS+패키지미러만 (k3s 내장 NP, 필요시 Calico)
- [ ] PVC StorageClass·학생 노드풀(taint/toleration, RWO 제약)
- [ ] **alpha 검증**: 파이프라인으로 배포 후 StatefulSet replicas를 **0↔N 올렸다 내렸다** 수동 확인

**Phase 2 게이트**: (로컬) k3d에서 exam 1개 띄워 학생 1명이 S1과 동일 동작 / (alpha) ArgoCD가 상주를 배포하고 StatefulSet 스케일이 파이프라인으로 동작.

---

## Phase 3 — exam-ops 자동화 — 레퍼런스 [2 §6, 3 §3·§5, 5 §4]

**의존: Phase 2.**
> 현황(2026-06-10): 🟡 **로컬판 핵심 구현** — 가상키 주입·회차 트리거(web→k8s API)·슬롯별 라우팅·패키징 Job·close 상태머신 동작(코드·typecheck·build 통과, k3d e2e 재검증 대기). 잔여 = GitOps 트리거(alpha)·마감 스윕·비동기 창(B).
> 검증: 자동화 **로직은 로컬 k3d에서 소수로 확인**(회차 열기→provision→취합→scale-down) → **alpha에서 실 파이프라인**(catchup-helm 커밋→ArgoCD sync)으로 검증.

- [x] **가상키 주입 경로**: provision이 슬롯당 `/key/generate`(예산=`llm_budget_usd`) → Secret `exam-virtual-keys` → pod 기동 래퍼가 ordinal 키 export. ⚠️ 계획의 pod self-register/heartbeat 방식(§3 경우 B) 대신 **provision 일괄 발급**으로 구현(동시 버스트 A에 충분; B 재활용 시 재검토)
- [🟡] **자동 회차 트리거(0↔50) = cold path**: 대시보드 "시험 환경 열기" → [`examOpsService.provisionBatch`](../apps/web/lib/services/examOpsService.ts) → **로컬: k8s API 직접**(ConfigMap·Secret·scale 0→N·슬롯 라우팅·register, PVC wipe 포함). close = N→0+회수. ⬜ alpha부터는 같은 서비스의 k8s 호출부를 `catchup-helm/batches/current.yaml` 커밋(bitbucket API)으로 교체(§5.4). **풀 용량 사건만**(학생 배정 아님)
- [x] **슬롯 할당 = hot path**: [시험 시작] → DB 트랜잭션(`UPDATE … FOR UPDATE SKIP LOCKED`)으로 ready 슬롯 원자 점유 → 슬롯별 IDE 경로. **git/ArgoCD/Helm 무관** — 5명 동시 클릭 동시성 안전 (docs/2 §6). 가상키는 슬롯에 선부착(provision)이라 배정 시 추가 동작 없음
- [ ] **워밍 풀 통합 모델(A=B 단일 엔진) — 라이브 입장** (2026-06-10 설계 확정, docs/2 §5~§7·0007의 "A는 B의 특수 케이스" 원칙을 구현 계획으로 구체화):
  - **파라미터 1개로 통합**: `batches.warm_count`(0013 예정) = 미리 띄울 pod 수(고정값; "20%"는 관리자가 capacity×0.2를 입력). NULL=capacity ⇒ 지금의 일괄(A). 작게 주면 라이브 입장(B). **모드 분기 코드 없음 — 전부 데이터**.
  - **provision 변경(선준비 최대화)**: 가상키 capacity개 선발급·Secret/슬롯별 Service·Ingress/슬롯 row는 **capacity만큼 전부 선생성**(키는 슬롯 번호에 붙으므로 가능), **replicas만 warm_count로 시작**. cold 성장 = `scale +Δ` 한 줄(이미 있는 인프라 전부 재사용).
  - **슬롯 ready 전이 주체 = web 컨트롤러**(k8s pod Ready 폴링 → down/warming→ready). ⚠️ pod self-register는 배제 — 학생 pod은 적대적 클라이언트라 INTERNAL_API_SECRET을 줄 수 없다(대원칙 ⑤).
  - **시작 클릭(hot path 확장)**: ready 슬롯 있으면 즉시 배정(현행 SKIP LOCKED 그대로) / 없으면 **입장 큐**(`hosted.entry_queue`, 0013)에 FIFO 등록 → 대기 화면으로. **큐와 무관하게 git/Helm은 안 만진다**.
  - **reconcile(버퍼 보충·큐 배정) = 요청 유도형**: 대기 화면의 상태 폴링 엔드포인트가 호출될 때마다 idempotent reconcile(pg advisory lock으로 동시 1개): ① pod Ready↔슬롯 ready 동기화 ② 큐 head에 ready 슬롯 FIFO 배정 ③ `ready+기동중 < 대기열+warm_count`면 replicas+Δ(상한 capacity). **별도 데몬·cron 불필요**(로컬 단순함 — alpha+에서 주기 트리거 보강 여지).
  - **대기 UI(전원 제공)**: 시작 후 슬롯 미배정이면 진행 화면 대신 대기 화면 — 단계 표시 ① 대기열 n번째(DB) ② 환경 기동 중(pod Pending/Creating, k8s API) ③ 문제 설치 중(initContainer) ④ 연결 — 배정되면 자동 전환.
  - **실시간 채널 결정: 폴링(2초) 채택, WebSocket 비권고** — ⚠️ 이 인프라에서 web 경유 WS는 **실측 502**(1c 채택 경위: k3d traefik↔Next 커스텀서버 업그레이드 실패 — IDE도 그래서 ForwardAuth 직결로 우회). 대기 상태는 초 단위 전이라 2초 폴링으로 "과정"이 충분히 라이브하게 보이고, 인원당 폴링 부하는 무시 가능. 필요해지면 SSE(순수 HTTP 스트림, traefik 무사통과)로 업그레이드 — WS는 다시 안 간다.
- [ ] **비동기 슬롯 재활용(워밍 풀 후속)**: attempt 단위 `…→submitting→recycling→ready` 재활용([`0008`](../db/migrations/0008_slot_window_states.sql)) + **재배정 전 PVC wipe+재시드**(작업물 누수 0). 명부 ≤ capacity면 불필요 — 명부가 풀보다 클 때만 (docs/2 §6, docs/5 §3)
- [ ] **B 운영 정책 확정**(재활용 구현 전): 큐 타임아웃·창밖 차단(0007 window_*)·idle reclaim(heartbeat 임계값)·다일창 문제유출(변형 뱅크 필수)·0007 조건부 CHECK (docs/2 §6)
- [x] **제출 파이프라인**: 제출/강제제출 → 패키징 Job(PVC readOnly→tar+sha256→MinIO `exam-artifacts`→[internal 콜백](../apps/web/app/api/internal/submissions/package/route.ts)이 submissions·submission_files 등록, 슬롯 submitting→recycling). fail-soft(제출 자체는 트랜잭션으로 확정)
- [ ] **마감 자동 회수**: deadline 스윕 → 미제출도 자동 패키징(누락 0)
- [x] **취합 순서 불변**: accepted 확정(패키징 콜백) → close(scale-down) → 다음 provision이 PVC wipe·재시드 — close는 PVC를 지우지 않아 누락분 재패키징 여지 보존
- [ ] **장애 복구**: sync 실패/슬롯 부족 → 재배포·일정조정으로 회복(작업물은 PVC 보존, 마감은 서버 강제)

**Phase 3 게이트**: 대시보드 "회차 열기" 한 번으로 프로비전→배정→캡처→취합→scale-down이 자동.

---

## Phase 4 — 50 동시 리허설 (prod 전용) — 레퍼런스 [2 §0·§7, 4]

**의존: Phase 3.**
> 환경: **prod 전용** — 50 규모·실부하·노드풀·Tier는 단일 머신 물리 한계로 로컬/alpha 소규모에선 검증 불가(§0.5).

- [ ] **Anthropic Tier 산정**: 소수 인원 실측(OTPM 병목) → Tier 3+ 또는 Priority Tier 신청, 캐싱율 모니터링
- [ ] 자원 재실측: 50명 동시 requests/limits 검증, 사전 워밍 5~10 pod
- [ ] **50개 동시 리허설**: 프로비전→배정→캡처→취합→scale-down→재시드 초기화 통과
- [ ] 장애 주입: pod crash·노드 장애·게이트웨이 replica 죽음·재접속 시나리오
- [ ] 복구 리허설: 재배포·일정조정으로 장애에서 회복

**Phase 4 게이트 = S2 완료**: 50명 동시 회차가 사고 없이 한 사이클 완주, 모든 결과가 MinIO+DB에 보존.

---

## (폐기됨) 병렬 트랙 — 어댑터 B (BYOD)

> ⚠️ **BYOD는 폐기됐다.** 전달방식은 hosted 단일이며, 과거 이 트랙이 담당하던 업로드 검증·업로드 UI·정규화 대화로그 validator/fixture는 코드·스키마에서 전면 제거됐다([`0009_drop_byod.sql`](../db/migrations/0009_drop_byod.sql)). 제출은 호스팅 프록시 캡처가 정규화 포맷으로 직접 채운다(docs/2 §10). 정규화 포맷 계약(JSON Schema v1 + fixture + CI contract test)은 hosted 프록시 출력 검증용으로 유지·구현 예정.

---

## 의존 그래프 (한눈에)

```
Phase 0 (S1 ✅ 완료)
   └→ Phase 1 (DB✅ · 대시보드✅ · MinIO✅ · 문제업로드✅ · 앱셸+hosted IDE✅)   로컬 완결분 ✅
        └→ Phase 2 (2a 로컬 k3d 검증 ✅ → 2b alpha 실 파이프라인 ⬜ 아티팩트만)               ┐ local: 소수 검증
             └→ Phase 3 (exam-ops 자동화 🟡 로컬판 구현 — 트리거·가상키·슬롯라우팅·패키징 ✅ │ alpha: 실 GitOps
                          / 마감 스윕·GitOps 트리거·재활용(B) ⬜)  ← 현재 여기                 │
                  └→ Phase 4 (50 동시 리허설 = S2 완료 ⬜)                        ┘ prod: 50 규모·실부하
[환경] local(k3d, 2~5명 확인) → alpha(실 파이프라인·StatefulSet 0↔N) → prod(50 동시) — §0.5
[이후] S3 동적 오케스트레이터 — 동시 batch가 50 초과로 실제 필요해질 때만(2 §5)
```

## 횡단 원칙 (모든 Phase 공통, reference 대원칙 5)
- 경계를 이름으로(패키지·DB schema 분리) / 불변식은 DB가 강제(NOT NULL·FK·트리거)
- 단순함은 의도된 선택(과설계 금지) / 클라 입력은 적대적 — **점수·모델·trust·소유권은 서버가 재판단**
- ⚠️ 시크릿(진짜 키·master key)은 게이트웨이/Secret에만, git 평문 금지. 채팅 노출 키는 즉시 로테이션.
- **풀(cold/GitOps) ≠ 할당(hot/DB):** pod 개수는 ArgoCD가 선언(coarse·최종일관성), 학생 배정은 DB 트랜잭션(`SKIP LOCKED`·즉시). **시작 버튼은 git을 안 만진다** (docs/2 §5·§6)

## 한 문장 정리
**S1에서 증명한 루프를, 코어(DB·MinIO·앱) → k8s → 자동화 → 리허설 순으로 올리면,
"회차 열기" 한 번으로 50명 동시 시험이 안전하게 돌고 어떤 사고에도 결과가 유실되지 않는 환경이 완성된다.**
