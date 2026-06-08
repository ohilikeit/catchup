# 6. 구현 계획 — 최종 시험 환경 구축 로드맵

> 목적: [2](./2-exam-environment.md)(설계)·[3](./3-s2-k8s-skeleton.md)(k8s)·[4](./4-exam-serving-overview.md)(운영)·[5](./5-storage-submission-pipeline.md)(스토리지)를
> **무엇을·어떤 순서로 만들지** 하나의 실행 계획으로 종합. 각 항목은 위 문서를 레퍼런스로 가리킨다.
> 전제: 사내 k3s + ArgoCD, 동시 50명/회차, 진짜 키 1개(게이트웨이 보관), 공식 MinIO 사용.
> 환경 3계층(§0.5): **local**(k3d, 2~5명 기능 확인) → **alpha**(사내, 실 GitOps 파이프라인) → **prod**(50 동시). harbor는 alpha/prod 전용(로컬 우회).

## 핵심 한 줄
**S1(로컬 Docker)에서 핵심 루프는 검증 완료. 이제 ① 플랫폼 코어(DB·MinIO·앱 셸·대시보드) → ② S2 k8s 편입 →
③ exam-ops 자동화 → ④ 50 동시 리허설 순으로 쌓고, 어댑터 B(BYOD)를 병렬 안전망으로 항상 준비한다.**

> 📌 **현황 (2026-06-08 코드 대조)** — 코어의 *로컬 완결 가능 부분*은 계획보다 앞서 있다.
> **DB 스키마**(exam·hosted·ops)·**대시보드**(회차 개설·로스터 import·스코프)·**BYOD 전 경로**(검증·업로드·제출)는
> 사실상 구현 완료. 남은 코어는 **MinIO 실물 저장**(현재 제출 파일 ref가 `upload://` 목업), **hosted iframe 프록시**(현재 "준비 중" 플레이스홀더),
> **litellm DB 흡수**. 그 위로 **k8s/Helm/ArgoCD·exam-ops 자동화는 전무**다.
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
| **web 앱 셸** | 상단바(타이머·제출)+iframe 프록시 | 🟡 BYOD 완성·hosted iframe 미구현 | 2 §2, 4 |
| **관리자 대시보드** | 시험 준비·중앙 관제·운영 액션 | 🟡 회차개설·로스터·운영액션 구현 / spend 관제 대기 | 2 §13, 4 |
| **DB 스키마** | batches/attempts/slots/submissions | ✅ `0003_exam`·`0004_hosted`·`0005_ops` | 5 §3 |
| **litellm DB 흡수** | 가상키·spend 저장 (S1 별도 `litellm-db` → 메인 postgres) | ⬜ 통합 | 3 §0·§7 |
| **MinIO 버킷** | scaffold/hidden/artifacts/chatlogs | ⬜ 생성·정책 (스토리지 코드 전무) | 5 §2 |
| **제출 파이프라인** | 서버측 패키징 Job + 마감 자동 회수 | 🟡 BYOD 업로드·검증·DB적재 완성 / 실물저장(MinIO)·패키징 Job 미구현 | 5 §4·§7 |
| **exam-ops** | 가상키 발급·0↔50 스케일·마감 스윕 | ⬜ 구현 | 2 §6, 3 §5 |
| k8s 매니페스트 | web/litellm/exam/networkpolicy/argocd | ⬜ 작성 | 3 |
| **catchup-helm 레포** | Helm chart + values + batch overlay (ArgoCD watch) | ⬜ 생성 | 3 §5.1 |
| **자동 회차 트리거** | exam-ops가 catchup-helm 커밋 → ArgoCD sync | ⬜ 구현 | 3 §5.4 |
| 어댑터 B(BYOD) | 업로드 검증 안전망 | ✅ validator(v1)·업로드 UI·제출 완성 (실물저장만 MinIO 대기) | 2 §9 |

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
- [x] `db/migrations/00NN_*.sql`: `hosted` schema, `exam.batches`, `exam.attempts`(batch_id·deadline_at·delivery_mode), `exam.attempt_events`, `hosted.slots` → [`0003_exam.sql`](../db/migrations/0003_exam.sql)·[`0004_hosted.sql`](../db/migrations/0004_hosted.sql)
- [x] `exam.submissions.attempt_id`(UNIQUE 1:1), `exam.submission_files`(kind·ref·sha256·size_bytes·mime)
- [x] 상태 제약·인덱스(examinee_id·status / batch·status)·`updated_at` 트리거 → ⚠️ 계획의 `attempt_status` **ENUM**은 실제로 **CHECK 제약**으로 구현(`ready/running/submitted/expired/void`, 기능 동등). `hosted.slots`·`ops.roster_imports`([`0005_ops.sql`](../db/migrations/0005_ops.sql))도 포함
- [x] 적용·검증: `pnpm db:migrate` (철칙 1·2)
- [ ] **litellm DB 흡수** (S1 별도 `litellm-db` 폐기): 메인 postgres에 **litellm 전용 DB/schema** 생성 → `litellm-secrets.DATABASE_URL`을 메인 postgres로. LiteLLM 스키마는 **prisma가 자체 관리**(우리 `db/migrations`와 분리), 백업·마이그레이션 정책만 분리 (docs/3 §0·§7)

### 1b. MinIO 버킷·정책 — 레퍼런스 [5 §2] — ⬜ **미착수 (코어의 가장 큰 빈칸)**
- [ ] 버킷 생성: `exam-scaffold` / `exam-hidden`(서버 전용) / `exam-artifacts` / `exam-chatlogs`
- [ ] 정책: hidden은 학생 자격 접근 0, artifacts/chatlogs는 서버(Job/앱)만 쓰기
- [ ] repository/service에 MinIO 클라이언트 래퍼(서명 URL·put·get) → ⚠️ 현재 `apps/web/lib/`에 스토리지 코드 전무. 제출 파일은 메타만 DB에 적재하고 `submission_files.ref`가 `upload://파일명` **목업** 상태(실물 저장 안 됨). **로컬에서 끝까지 가능한 작업** — 루트 docker-compose에 MinIO 추가 + `lib/storage` 래퍼 + 업로드 경로를 실제 put으로 교체

### 1c. 앱 셸 (학생 화면) — 레퍼런스 [2 §2, 4] — 🟡 **BYOD 완성 / hosted iframe 미구현**
- [x] 시험 페이지 골격: 상단바 + 서버 `deadline_at` 기준 카운트다운([`Countdown.tsx`](../apps/web/app/(exam)/_components/Countdown.tsx)) + `delivery_mode` 분기([`ExamRuntime.tsx`](../apps/web/app/(exam)/exam/[attemptId]/ExamRuntime.tsx)) + 마감 처리. 서버 라우트가 status로 intro/done 분기
- [x] **BYOD 분기 전체**: scaffold 다운로드 + 대화로그/산출물 업로드 + 클라 sha256 + 미리보기 + 제출 확인 모달 → 완성
- [ ] **hosted 분기 = "준비 중" 플레이스홀더**: iframe(code-server 역프록시) / websocket 통과 프록시 / 1:1 슬롯 매핑(`hosted.slots`) 라우팅 / 마감 시 iframe 차단 → **전부 미구현** (제출 버튼 `disabled`). ⚠️ 로컬에서 끝까지 검증 불가(Phase 2/3 의존)
- [ ] **재접속 복귀**: 재로그인 → 진행 중 attempt 조회 → 같은 슬롯 재연결(5 §5) — hosted 의존, 미구현

### 1d. 관리자 대시보드 — 레퍼런스 [2 §13, 4] — 🟡 **운영 골격 구현 / 일부 관제 대기**
- [x] 준비: 회차(batch) 생성·로스터 import(xlsx)·스코프 강제(admin 전체 / org_admin 자기 대학) → [`batchService.ts`](../apps/web/lib/services/batchService.ts), `admin/{batches,problems,students,submissions,orgs}`·`org/*` 라우트
- [ ] 준비(잔여): **문제 업로드(MinIO)** — 업로드 API/UI 없음(MinIO 의존), 일정·예산
- [ ] 관제: 슬롯 현황(`hosted.slots`)·학생 진행(`attempt_events`)·**spend(/key/info)** — spend는 LiteLLM 게이트웨이 연동 대기
- [x] 액션 골격: 회차 상태전이·시간 연장(`deadline_at`)·무효(`canOperate`=admin) → [ ] 강제 제출·BYOD 강등은 잔여

**Phase 1 게이트**: 로컬에서 web 앱이 S1 exam 컨테이너를 iframe 프록시하고, 상단바 타이머·제출이 DB/MinIO에 저장되며, 대시보드로 회차를 만들 수 있다.
> 현황: **대시보드 회차 생성 ✅ / BYOD 제출 DB 적재 ✅**. 게이트의 잔여 = **MinIO 실물 저장**(로컬 완결 가능) + **iframe 프록시**(로컬 불가, k8s 의존). 즉 게이트를 *로컬 범위로 좁히면* "MinIO만 채우면 BYOD 한정 통과"다.

---

## Phase 2 — S2 k8s 편입 — 레퍼런스 [3]

**의존: Phase 1(코어). S1 이미지·게이트웨이를 k8s로 옮김. 환경 3계층은 §0.5.**
> 현황: ⬜ **전무** (레포에 `Chart.yaml`·`values.yaml`·manifest·ArgoCD Application 0건, `catchup-helm` 미생성).
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
> 현황: ⬜ **전무** (가상키 주입·0↔50 스케일·마감 스윕·패키징 Job 코드 없음). Phase 2 선행 필요.
> 검증: 자동화 **로직은 로컬 k3d에서 소수로 확인**(회차 열기→provision→취합→scale-down) → **alpha에서 실 파이프라인**(catchup-helm 커밋→ArgoCD sync)으로 검증.

- [ ] **가상키 주입 경로**: pod self-register/heartbeat → exam-ops가 `/key/generate` → pod에 가상키 attach(§3 경우 B 메커니즘)
- [ ] **자동 회차 트리거(0↔50)**: 대시보드 "회차 열기" → exam-ops가 `catchup-helm/batches/current.yaml` 커밋(bitbucket API, 배포키) → ArgoCD auto-sync → 0→50. close 시 replicas:0 커밋 (§5.4 — 처음부터 자동, 수동 단계 생략)
- [ ] **제출 파이프라인**: 제출 버튼/마감 → 패키징 Job(PVC readOnly→tar+sha256→MinIO, DB 등록)
- [ ] **마감 자동 회수**: deadline 스윕 → 미제출도 자동 패키징(누락 0)
- [ ] **취합 순서 불변**: accepted 확정 → scale-down → PVC wipe·재시드
- [ ] **폴백**: sync 실패/슬롯 부족 → `delivery_mode='byod'` 자동 강등

**Phase 3 게이트**: 대시보드 "회차 열기" 한 번으로 프로비전→배정→캡처→취합→scale-down이 자동.

---

## Phase 4 — 50 동시 리허설 (prod 전용) — 레퍼런스 [2 §0·§7, 4]

**의존: Phase 3.**
> 환경: **prod 전용** — 50 규모·실부하·노드풀·Tier는 단일 머신 물리 한계로 로컬/alpha 소규모에선 검증 불가(§0.5).

- [ ] **Anthropic Tier 산정**: 소수 인원 실측(OTPM 병목) → Tier 3+ 또는 Priority Tier 신청, 캐싱율 모니터링
- [ ] 자원 재실측: 50명 동시 requests/limits 검증, 사전 워밍 5~10 pod
- [ ] **50개 동시 리허설**: 프로비전→배정→캡처→취합→scale-down→재시드 초기화 통과
- [ ] 장애 주입: pod crash·노드 장애·게이트웨이 replica 죽음·재접속 시나리오
- [ ] 폴백 리허설: BYOD 자동 강등이 실제 동작

**Phase 4 게이트 = S2 완료**: 50명 동시 회차가 사고 없이 한 사이클 완주, 모든 결과가 MinIO+DB에 보존.

---

## 병렬 트랙 — 어댑터 B (BYOD 안전망) — 레퍼런스 [2 §9, §10]

**Phase와 무관하게 먼저·항상 준비** (호스팅 실패의 최후 보루) — ✅ **사실상 완료** (실물 저장만 MinIO 대기):
- [x] 대화 로그 포맷 v1 고정 + accepted/rejected fixture → ⚠️ 계획의 `contracts/chat-log.v1.json`(JSON Schema 파일)은 **코드 validator로 대체**: [`lib/submission/chatLog.ts`](../apps/web/lib/submission/chatLog.ts)(의존성 없는 순수 검증기, 의도된 단순화) + [`fixtures.ts`](../apps/web/lib/submission/fixtures.ts). [ ] CI 계약 테스트는 잔여(테스트 스위트 부재)
- [x] 업로드 검증: 크기/MIME/sha256·`trust='unverified'` 서버 산출 → [ ] 아카이브 안전(zip 폭탄·경로탈출)은 실물 저장(MinIO/패키징) 도입 시 추가
- [x] 업로드 UI → submission(received→validating→accepted): [`ExamRuntime.tsx`](../apps/web/app/(exam)/exam/[attemptId]/ExamRuntime.tsx) BYOD 분기 + [`submit/route.ts`](../apps/web/app/api/exam/[attemptId]/submit/route.ts) + [`submissionService.ts`](../apps/web/lib/services/submissionService.ts). ⚠️ 단 파일 실물은 아직 저장 안 됨(`ref=upload://` 목업) — **MinIO 도입이 BYOD를 닫는 마지막 한 조각**

---

## 의존 그래프 (한눈에)

```
Phase 0 (S1 ✅ 완료)
   └→ Phase 1 (DB✅ · 대시보드🟡 · 앱셸🟡 · MinIO⬜)   ← 현재 여기 (로컬 완결 잔여 = MinIO)
        └→ Phase 2 (2a 로컬 k3d 검증 ⬜ → 2b alpha 실 파이프라인 ⬜)  ┐ local: 소수 검증
             └→ Phase 3 (exam-ops 자동화 ⬜)                          │ alpha: 실 GitOps
                  └→ Phase 4 (50 동시 리허설 = S2 완료 ⬜)            ┘ prod: 50 규모·실부하
[병렬] 어댑터 B(BYOD) ✅ — 거의 완성(MinIO 실물저장만 잔여)
[환경] local(k3d, 2~5명 확인) → alpha(실 파이프라인·StatefulSet 0↔N) → prod(50 동시) — §0.5
[이후] S3 동적 오케스트레이터 — 동시 batch가 50 초과로 실제 필요해질 때만(2 §5)
```

## 횡단 원칙 (모든 Phase 공통, reference 대원칙 5)
- 경계를 이름으로(패키지·DB schema 분리) / 불변식은 DB가 강제(NOT NULL·FK·트리거)
- 단순함은 의도된 선택(과설계 금지) / 클라 입력은 적대적 — **점수·모델·trust·소유권은 서버가 재판단**
- ⚠️ 시크릿(진짜 키·master key)은 게이트웨이/Secret에만, git 평문 금지. 채팅 노출 키는 즉시 로테이션.

## 한 문장 정리
**S1에서 증명한 루프를, 코어(DB·MinIO·앱) → k8s → 자동화 → 리허설 순으로 올리고 BYOD를 상시 깔아두면,
"회차 열기" 한 번으로 50명 동시 시험이 안전하게 돌고 어떤 사고에도 결과가 유실되지 않는 환경이 완성된다.**
