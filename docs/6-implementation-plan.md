# 6. 구현 계획 — 최종 시험 환경 구축 로드맵

> 목적: [2](./2-exam-environment.md)(설계)·[3](./3-s2-k8s-skeleton.md)(k8s)·[4](./4-exam-serving-overview.md)(운영)·[5](./5-storage-submission-pipeline.md)(스토리지)를
> **무엇을·어떤 순서로 만들지** 하나의 실행 계획으로 종합. 각 항목은 위 문서를 레퍼런스로 가리킨다.
> 전제: 사내 k3s + ArgoCD, 동시 50명/회차, 진짜 키 1개(게이트웨이 보관), 공식 MinIO 사용.

## 핵심 한 줄
**S1(로컬 Docker)에서 핵심 루프는 검증 완료. 이제 ① 플랫폼 코어(DB·MinIO·앱 셸·대시보드) → ② S2 k8s 편입 →
③ exam-ops 자동화 → ④ 50 동시 리허설 순으로 쌓고, 어댑터 B(BYOD)를 병렬 안전망으로 항상 준비한다.**

---

## 0. 컴포넌트 인벤토리 (최종 환경)

| 컴포넌트 | 역할 | 상태 | 참조 |
|---|---|---|---|
| exam 이미지 | code-server + claude code(+확장) + seeder | ✅ S1 완료 | [README](../experiments/s1-docker-spike/README.md) |
| LiteLLM 게이트웨이 | 진짜 키 보관·`*`→Sonnet·가상키·spend | ✅ S1 완료 | 2 §3, 3 §2 |
| 가상키 발급 | `/key/generate` 자동(예산·만료) | ✅ S1 완료 | 2 §3, 3 §3 |
| **web 앱 셸** | 상단바(타이머·제출)+iframe 프록시 | ⬜ 구현 | 2 §2, 4 |
| **관리자 대시보드** | 시험 준비·중앙 관제·운영 액션 | ⬜ 구현 | 2 §13, 4 |
| **DB 스키마** | batches/attempts/slots/submissions | ⬜ 마이그레이션 | 5 §3 |
| **litellm DB 흡수** | 가상키·spend 저장 (S1 별도 `litellm-db` → 메인 postgres) | ⬜ 통합 | 3 §0·§7 |
| **MinIO 버킷** | scaffold/hidden/artifacts/chatlogs | ⬜ 생성·정책 | 5 §2 |
| **제출 파이프라인** | 서버측 패키징 Job + 마감 자동 회수 | ⬜ 구현 | 5 §4·§7 |
| **exam-ops** | 가상키 발급·0↔50 스케일·마감 스윕 | ⬜ 구현 | 2 §6, 3 §5 |
| k8s 매니페스트 | web/litellm/exam/networkpolicy/argocd | ⬜ 작성 | 3 |
| **catchup-helm 레포** | Helm chart + values + batch overlay (ArgoCD watch) | ⬜ 생성 | 3 §5.1 |
| **자동 회차 트리거** | exam-ops가 catchup-helm 커밋 → ArgoCD sync | ⬜ 구현 | 3 §5.4 |
| 어댑터 B(BYOD) | 업로드 검증 안전망 | ⬜ 병렬 | 2 §9 |

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

### 1a. DB 스키마 (정보원) — 레퍼런스 [5 §3]
- [ ] `db/migrations/00NN_*.sql`: `hosted` schema, `exam.batches`, `exam.attempts`(batch_id·slot·deadline_at·trust), `exam.attempt_events`, `hosted.slots`
- [ ] `exam.submissions.attempt_id` 추가, `exam.submission_files`(kind·storage_key·sha256·size·mime)
- [ ] `attempt_status` ENUM, 인덱스(examinee_id·status / batch·status), `updated_at` 트리거
- [ ] 적용·검증: `pnpm db:migrate` (철칙 1·2)
- [ ] **litellm DB 흡수** (S1 별도 `litellm-db` 폐기): 메인 postgres에 **litellm 전용 DB/schema** 생성 → `litellm-secrets.DATABASE_URL`을 메인 postgres로. LiteLLM 스키마는 **prisma가 자체 관리**(우리 `db/migrations`와 분리), 백업·마이그레이션 정책만 분리 (docs/3 §0·§7)

### 1b. MinIO 버킷·정책 — 레퍼런스 [5 §2]
- [ ] 버킷 생성: `exam-scaffold` / `exam-hidden`(서버 전용) / `exam-artifacts` / `exam-chatlogs`
- [ ] 정책: hidden은 학생 자격 접근 0, artifacts/chatlogs는 서버(Job/앱)만 쓰기
- [ ] repository/service에 MinIO 클라이언트 래퍼(서명 URL·put·get)

### 1c. 앱 셸 (학생 화면) — 레퍼런스 [2 §2, 4]
- [ ] 시험 페이지: **상단바(서버 `deadline_at` 기준 카운트다운 + 제출 버튼) + iframe(code-server 역프록시)**
- [ ] websocket 통과 프록시, 1:1 슬롯 매핑(`attempts.slot`)으로만 라우팅
- [ ] 마감 시 iframe 차단 → 제출 페이지 전환
- [ ] **재접속 복귀**: 재로그인 → 진행 중 attempt 조회 → 같은 슬롯 재연결(5 §5)

### 1d. 관리자 대시보드 — 레퍼런스 [2 §13, 4]
- [ ] 준비: 문제 업로드(MinIO)·회차(batch) 생성·로스터·일정·예산
- [ ] 관제: 슬롯 현황(slots)·학생 진행(attempt_events)·spend(/key/info)
- [ ] 액션: 시간 연장(deadline_at)·강제 제출·BYOD 강등

**Phase 1 게이트**: 로컬에서 web 앱이 S1 exam 컨테이너를 iframe 프록시하고, 상단바 타이머·제출이 DB/MinIO에 저장되며, 대시보드로 회차를 만들 수 있다.

---

## Phase 2 — S2 k8s 편입 — 레퍼런스 [3]

**의존: Phase 1(코어). S1 이미지·게이트웨이를 k8s로 옮김.**

- [ ] **레포 분리**: `catchup`(app) / `catchup-helm`(deploy) 생성 (사내 정책, §5.1)
- [ ] **Helm chart화**: raw yaml(docs/3) → `catchup-helm/charts/exam-platform` + `values/{staging,prod}.yaml` + `batches/current.yaml`
- [ ] **bitbucket pipeline**: `catchup` push → 이미지(`catchup-exam`·`catchup-web`·`exam-packager`) 빌드 → harbor → `catchup-helm` `image.tag` 자동 bump
- [ ] 시크릿: `litellm-secrets`·`app-secrets`를 SealedSecrets/External Secrets로
- [ ] 학생 pod: `exam` StatefulSet(replicas 0, initContainer seeder, PVC, 하드닝)·headless Service
- [ ] NetworkPolicy: 학생 pod egress = litellm(4000)+DNS+패키지미러만 (⚠️ flannel→Calico 확인)
- [ ] **ArgoCD Application**: source=`catchup-helm`(helm valueFiles), 상주 선언 + StatefulSet replicas=0 (§5.3)
- [ ] PVC StorageClass·학생 노드풀(taint/toleration, RWO 제약)

**Phase 2 게이트**: ArgoCD가 상주를 배포하고, 수동으로 exam을 1개 띄워 학생 1명이 k8s에서 S1과 동일하게 동작.

---

## Phase 3 — exam-ops 자동화 — 레퍼런스 [2 §6, 3 §3·§5, 5 §4]

**의존: Phase 2.**

- [ ] **가상키 주입 경로**: pod self-register/heartbeat → exam-ops가 `/key/generate` → pod에 가상키 attach(§3 경우 B 메커니즘)
- [ ] **자동 회차 트리거(0↔50)**: 대시보드 "회차 열기" → exam-ops가 `catchup-helm/batches/current.yaml` 커밋(bitbucket API, 배포키) → ArgoCD auto-sync → 0→50. close 시 replicas:0 커밋 (§5.4 — 처음부터 자동, 수동 단계 생략)
- [ ] **제출 파이프라인**: 제출 버튼/마감 → 패키징 Job(PVC readOnly→tar+sha256→MinIO, DB 등록)
- [ ] **마감 자동 회수**: deadline 스윕 → 미제출도 자동 패키징(누락 0)
- [ ] **취합 순서 불변**: accepted 확정 → scale-down → PVC wipe·재시드
- [ ] **폴백**: sync 실패/슬롯 부족 → `delivery_mode='byod'` 자동 강등

**Phase 3 게이트**: 대시보드 "회차 열기" 한 번으로 프로비전→배정→캡처→취합→scale-down이 자동.

---

## Phase 4 — 50 동시 리허설 — 레퍼런스 [2 §0·§7, 4]

**의존: Phase 3.**

- [ ] **Anthropic Tier 산정**: 소수 인원 실측(OTPM 병목) → Tier 3+ 또는 Priority Tier 신청, 캐싱율 모니터링
- [ ] 자원 재실측: 50명 동시 requests/limits 검증, 사전 워밍 5~10 pod
- [ ] **50개 동시 리허설**: 프로비전→배정→캡처→취합→scale-down→재시드 초기화 통과
- [ ] 장애 주입: pod crash·노드 장애·게이트웨이 replica 죽음·재접속 시나리오
- [ ] 폴백 리허설: BYOD 자동 강등이 실제 동작

**Phase 4 게이트 = S2 완료**: 50명 동시 회차가 사고 없이 한 사이클 완주, 모든 결과가 MinIO+DB에 보존.

---

## 병렬 트랙 — 어댑터 B (BYOD 안전망) — 레퍼런스 [2 §9, §10]

**Phase와 무관하게 먼저·항상 준비** (호스팅 실패의 최후 보루):
- [ ] `contracts/chat-log.v1.json` JSON Schema v1 고정 + accepted/rejected fixture + CI 계약 테스트(P0)
- [ ] 업로드 검증: 크기/MIME/sha256/아카이브 안전(폭탄·경로탈출), `trust='unverified'`
- [ ] 업로드 UI → submission(received→validating→accepted)

---

## 의존 그래프 (한눈에)

```
Phase 0 (S1 ✅)
   └→ Phase 1 (DB·MinIO·앱셸·대시보드)
        └→ Phase 2 (k8s 매니페스트·배포)
             └→ Phase 3 (exam-ops 자동화)
                  └→ Phase 4 (50 동시 리허설 = S2 완료)
[병렬] 어댑터 B(BYOD) — 항상 먼저·상시 준비
[이후] S3 동적 오케스트레이터 — 동시 batch가 50 초과로 실제 필요해질 때만(2 §5)
```

## 횡단 원칙 (모든 Phase 공통, reference 대원칙 5)
- 경계를 이름으로(패키지·DB schema 분리) / 불변식은 DB가 강제(NOT NULL·FK·트리거)
- 단순함은 의도된 선택(과설계 금지) / 클라 입력은 적대적 — **점수·모델·trust·소유권은 서버가 재판단**
- ⚠️ 시크릿(진짜 키·master key)은 게이트웨이/Secret에만, git 평문 금지. 채팅 노출 키는 즉시 로테이션.

## 한 문장 정리
**S1에서 증명한 루프를, 코어(DB·MinIO·앱) → k8s → 자동화 → 리허설 순으로 올리고 BYOD를 상시 깔아두면,
"회차 열기" 한 번으로 50명 동시 시험이 안전하게 돌고 어떤 사고에도 결과가 유실되지 않는 환경이 완성된다.**
