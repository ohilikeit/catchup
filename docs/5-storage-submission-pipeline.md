# 5. 스토리지 · 제출 파이프라인 · 재접속 안전망

> 목적: 학생 작업물이 **어디에·어떻게 저장되고**, 제출이 **어떻게 영구화되며**, 학생이 화면을 끄거나 사고가 나도
> **어떻게 본인 환경으로 완벽히 복귀**하는지 정의. 상세 설계 [2-exam-environment.md](./2-exam-environment.md), 매니페스트 [3-s2-k8s-skeleton.md](./3-s2-k8s-skeleton.md), 운영 개요 [4-exam-serving-overview.md](./4-exam-serving-overview.md).
> 근거: 2번 §6·§8·§10·§11, reference/[02](./reference/02-db-schema.md)(스키마·JSONB·인덱스)·[03](./reference/03-cache.md).

## 핵심 한 줄
**진행 중 작업물 = PVC(임시 안전망) / 최종 산출물 zip = MinIO / 제출 메타·점수 = Postgres.
브라우저는 언제 꺼져도 되는 일회용 — 진짜 상태는 서버(pod·PVC·DB)에 있어 재로그인하면 같은 슬롯으로 100% 복귀한다.**

---

## 1. 데이터 3분류 → 3계층 저장

| 데이터 | 저장소 | 수명 | 비고 |
|---|---|---|---|
| 진행 중 `/workspace`(코드·편집상태) | **PVC** (pod별) | 시험 중만 | crash 안전망. 끝나면 wipe |
| 최종 산출물 zip, 대화 정규화 JSON | **MinIO** (객체 스토리지) | 영구 | 큰 바이너리. DB에 넣지 않음 |
| 제출 메타·status·점수·해시·MinIO키 | **Postgres** | 영구(정보원) | 구조화·채점·조회 |

```
시험 중:  code-server ──저장──→ PVC(/workspace)        ← 임시, crash 보존
제출/마감: 서버 Job ── tar+sha256 ──→ MinIO(artifact)   ← 영구 산출물
                    └ transcript 정규화 ─→ MinIO(chatlog)
                    └ 메타·키·해시·status ─→ Postgres     ← 영구 정보원
정리:     accepted 확정 → pod scale-down → PVC wipe(영구본은 MinIO+PG에 이미 안전)
```

> **원칙(docs §8·§10):** 큰 파일은 DB에 넣지 않는다. **MinIO에 실체, Postgres엔 포인터(키)+해시+메타**. reference/02 JSONB 규칙대로 검색·정렬값(status/score/sha256/key)은 컬럼, 모양 변하는 덩어리(result/answers)는 JSONB.

---

## 2. MinIO 버킷 구조 (입력·출력 분리)

```
minio/
├── exam-scaffold/         ← 입력: problem-registry의 scaffold (학생 환경에 시드, 읽기)
│   └── ainc2026/ …
├── exam-hidden/           ← ⚠️ 서버 전용: hidden-tests (학생 절대 접근 0, §4·§8)
├── exam-artifacts/        ← 출력: 제출 코드 zip
│   └── <attemptId>/artifact.tgz   (+ sha256)
└── exam-chatlogs/         ← 출력: 대화 정규화 JSON(§10)
    └── <attemptId>/chat-log.v1.json
```
- 버킷 정책: `exam-hidden`은 학생 pod의 자격으로 접근 불가(IAM/정책 분리). `exam-artifacts`/`exam-chatlogs`는 **서버(Job/앱)만 쓰기**.
- 학생 pod은 MinIO에 **직접 쓰지 않는다** — 서버측 패키징만(클라 조작 차단).

---

## 3. Postgres 매핑 (reference/02 정합)

기존 `exam.submissions`/`exam.submission_files`를 활용하고, S2에 **`exam.attempts`·`exam.attempt_events`를 추가**한다
(철칙 1: 새 `db/migrations/00NN_*.sql`로). 검색값=컬럼, 덩어리=JSONB.

```sql
-- batch = "한 회차" (관리자 대시보드가 생성·관제하는 단위)  [S2 신규]
CREATE TABLE exam.batches (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id            UUID NOT NULL REFERENCES exam.tests(id),
  problem_id         TEXT NOT NULL,                       -- problem-registry 키(§4, MinIO)
  capacity           INT  NOT NULL DEFAULT 50,
  deadline_at        TIMESTAMPTZ NOT NULL,                -- 회차 기본 마감(attempt가 상속/override)
  status             TEXT NOT NULL DEFAULT 'preparing',   -- preparing→open→closed
  model              TEXT NOT NULL DEFAULT 'claude-sonnet-4-5',  -- 게이트웨이 강제 모델
  budget_per_attempt NUMERIC NOT NULL DEFAULT 5,          -- 가상키 예산상한(USD)
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- attempt = "한 학생의 한 응시" (재접속·마감·trust의 단위)  [S2 신규]
CREATE TABLE exam.attempts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id     UUID NOT NULL REFERENCES exam.batches(id),
  test_id      UUID NOT NULL REFERENCES exam.tests(id),
  examinee_id  TEXT NOT NULL,                 -- auth 정체성(약한 참조, service가 책임)
  -- ⚠️ 구현(0003)엔 slot 컬럼 없음 — 슬롯 매핑은 hosted.slots.attempt_id로 격리(코어 밖)
  status       exam.attempt_status NOT NULL DEFAULT 'ready', -- ⚠️ 구현(0003) CHECK = ready|running|submitted|expired|void
  deadline_at  TIMESTAMPTZ NOT NULL,          -- ⭐ 제한시간의 정보원(서버 기준, 클라 시계 불신)
  trust        TEXT NOT NULL DEFAULT 'verified',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_attempt_examinee ON exam.attempts(examinee_id, status);  -- 재접속 시 "내 진행중 attempt" 조회

-- submission = 제출 1건 (attempt에 종속)
ALTER TABLE exam.submissions ADD COLUMN attempt_id UUID REFERENCES exam.attempts(id);
--   status: received→validating→accepted/rejected,  score,  result JSONB

-- submission_files = 실체는 MinIO, 여기엔 포인터+해시
--   kind('artifact'|'chat_log'), storage_key(MinIO 키), sha256, size_bytes, mime
--   submission_id UUID NOT NULL REFERENCES exam.submissions(id) ON DELETE CASCADE

-- attempt_events = 모든 전이 append (관측·디버깅·부정행위 분석, §11)
CREATE TABLE exam.attempt_events (
  id          BIGGENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attempt_id  UUID NOT NULL REFERENCES exam.attempts(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,   -- started|heartbeat|reconnect|crash|autosave|uploaded|submitted|auto_collected
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  meta        JSONB
);

-- hosted.slots = pod 슬롯 상태 (heartbeat 기반 관제, k8s 직접 접속 회피 §3④·§6)  [S2 신규]
CREATE TABLE hosted.slots (              -- ⚠️ 정본 = 0004_hosted.sql (아래는 그에 맞춤)
  batch_id          UUID NOT NULL REFERENCES exam.batches(id) ON DELETE CASCADE,
  slot_no           INT  NOT NULL,                -- pod ordinal 예: exam-7 (재접속 매핑의 물리키)
  attempt_id        UUID UNIQUE REFERENCES exam.attempts(id),  -- 1 attempt = 1 slot
  state             TEXT NOT NULL DEFAULT 'down', -- 0004: down|warming|ready|assigned (+0008 비동기 창 B: submitting|recycling)
  endpoint          TEXT,                          -- ClusterIP 내부 주소(학생 비노출)
  last_heartbeat_at TIMESTAMPTZ,                  -- "배정 가능?" 판단의 단일 근거(N초 갱신)
  PRIMARY KEY (batch_id, slot_no)
);
```
> `BIGGENERATED`는 `BIGINT GENERATED`의 오타 방지용 — 실제 DDL은 `id BIGINT GENERATED ALWAYS AS IDENTITY`.
> ⚠️ **구현 정합:** 이 §3 블록은 초기 스케치다. **정본은 [`0003_exam.sql`](../db/migrations/0003_exam.sql)·[`0004_hosted.sql`](../db/migrations/0004_hosted.sql)** — 실제와 차이: ① `attempts`에 slot 컬럼 없음(`hosted.slots.slot_no`로 격리) ② `attempts.status`=ready\|running\|submitted\|expired\|void ③ `hosted.slots` PK=(batch_id,slot_no)·state=down\|warming\|ready\|assigned(+[`0008`](../db/migrations/0008_slot_window_states.sql) submitting\|recycling).
>
> **가상키 spend**는 LiteLLM이 자기 DB(`litellm` schema/DB)에 자동 집계 → 대시보드는 `/key/info`로 읽는다(별도 exam 테이블 불필요).
> **대시보드 액션 매핑**: 시간 연장 = `attempts.deadline_at` 갱신 / 강제 제출 = §4 패키징 Job 수동 트리거.

---

## 4. 정상 제출 파이프라인

```
1. code-server 상단 타이머       ← 앱이 attempts.deadline_at로 남은시간 계산(서버 기준)
2. deadline 도달 → 앱이 접속 차단 → 제출 페이지로 이동(attempt.status='submitting')
3. [제출 버튼] → 앱이 서버측 패키징 Job 생성:
     a. PVC(/workspace)를 readOnly로 마운트 → tar + sha256 → MinIO(exam-artifacts)
     b. transcript 회수 → 정규화(§10) → MinIO(exam-chatlogs)
     c. Postgres: submission(received→validating→accepted), submission_files(키·해시)
4. accepted 확정 → attempt.status='accepted' → pod scale-down → PVC wipe
       (취합 먼저, 폐기 나중 — 순서 불변 §11)
```
⚠️ 패키징은 **반드시 서버측**(학생 pod 밖에서 PVC를 읽기전용으로). 학생이 zip을 조작 못 함 → `trust='verified'`(§8).

---

## 5. ★ 안전망 — 화면을 꺼도 본인 환경으로 완벽 복귀

`★ 핵심 원리 ─────────────────────────────────────`
**브라우저는 버려도 되는 일회용 클라이언트다.** 진짜 상태는 전부 서버에 있다:
- **pod + PVC**: code-server는 *서버에서* 돌고, 작업물은 PVC에 있다 → 브라우저를 닫아도 열린 파일·터미널·실행 프로세스·작업물이 그대로 살아 있다.
- **DB(hosted.slots.attempt_id)**: "학생 A의 attempt → slot_no" 매핑이 DB에 있다 → 재로그인하면 앱이 같은 슬롯으로 다시 연결한다.
- **DB(attempts.deadline_at)**: 제한시간은 서버 기준 → 재접속해도 시간이 정확히 이어진다(클라 시계와 무관).
→ 그래서 클라(화면)는 언제 죽어도 되고, **재로그인 = 같은 pod 재연결**이면 100% 복귀한다.
`─────────────────────────────────────────────────`

### 재접속 시퀀스 (실수로 탭을 닫은 경우)
```
학생이 탭/브라우저 닫음 (실수)
  → exam-7 pod 계속 살아있음. /workspace(PVC) 작업물 유지. code-server 세션 유지.
  → 학생 재로그인
  → 앱: examinee_id로 "진행 중 attempt #42" 조회(status=running, deadline 안 지남)
  → hosted.slots에서 attempt_id=#42 → slot_no=7 확인 → exam-7로 iframe 재프록시(websocket 재연결)
  → 화면 복구: 열려있던 파일·터미널·작업물 그대로, 상단 타이머 = deadline_at − now
  → attempt_events에 'reconnect' append (관측)
```

### 케이스별 동작

| 사고 | 어떻게 복구되나 |
|---|---|
| **탭/브라우저 닫음** | pod·PVC·세션 모두 서버에 살아있음 → 재로그인 → 같은 슬롯 복귀 |
| **새로고침(F5)** | websocket 재연결, code-server 세션 유지 → 즉시 복구 |
| **네트워크 일시 끊김** | 자동 재연결(code-server·앱 프록시) → 끊긴 구간만 복구 |
| **다른 기기에서 재접속** | 재로그인 → 같은 attempt/슬롯. ⚠️ **동시 1세션 정책**: 새 세션 활성화 시 이전 세션 무효화(부정행위·혼란 방지) |
| **pod crash(앱·런타임 오류)** | k8s가 자동 재시작 → **같은 PVC 재부착** → 작업물 보존, 잠깐 끊겼다 복귀. `crash` 이벤트 기록 |
| **노드 장애** | pod 다른 노드로 재스케줄(⚠️ PVC RWO는 노드 묶임 → 학생 노드풀·StorageClass 사전 설계 필요) |
| **마감까지 제출 버튼 안 누름** | **서버가 자동 회수**(아래) → 미제출도 산출물 보존 |

### 마감 자동 회수 (제출 버튼 의존 제거)
```
[close 시점] 앱이 deadline 지난 attempt 전수 점검
  → 미제출(status≠submitted) attempt도 §4의 패키징 Job을 서버가 자동 실행
  → MinIO+Postgres에 저장(trust 표기), attempt_events에 'auto_collected'
  → 그 다음에야 scale-down (취합 먼저, 폐기 나중)
```
> 제출 버튼 = **명시적 확정**, 자동 회수 = **누락 방지 안전망**. 둘 다 둔다. 학생이 아무 것도 안 해도 작업물은 남는다.

---

## 6. 데이터 손실 방지 — 다층 방어

| 위협 | 방어 계층 |
|---|---|
| 파일 미저장 | VS Code **auto-save**(N초) → PVC 즉시 기록 |
| 브라우저 종료 | 서버측 code-server 세션 + PVC(상태 보존) |
| pod crash | k8s 재시작 + **PVC 재부착** |
| 노드 장애 | PVC 재스케줄(노드풀·SC 설계) |
| 제출 누락 | **마감 자동 회수** |
| 산출물 조작 | **서버측 패키징 + sha256 봉인** |
| 진행 중 추가 보강(선택) | N분마다 PVC→MinIO **스냅샷**(autosave 이벤트) — PVC 자체 유실 대비 |

---

## 7. 제출 패키징 Job — 매니페스트 스켈레톤

서버(앱/exam-ops)가 attempt마다 생성. **학생 pod이 아니라 별도 Job**이 PVC를 readOnly로 읽는다.

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: submit-<attemptId>
  namespace: exam
spec:
  backoffLimit: 3
  template:
    spec:
      restartPolicy: OnFailure
      containers:
        - name: packager
          image: REGISTRY/exam-packager:TAG       # mc(minio client)·tar·해시 도구 포함
          env:
            - { name: ATTEMPT_ID, value: "<attemptId>" }
          command: ["/bin/sh", "-c"]
          args:
            - |
              set -e
              tar czf /tmp/artifact.tgz -C /workspace .
              SHA=$(sha256sum /tmp/artifact.tgz | cut -d' ' -f1)
              mc cp /tmp/artifact.tgz "minio/exam-artifacts/${ATTEMPT_ID}/artifact.tgz"
              # transcript 정규화 → exam-chatlogs, 그리고 앱 API로 submission_files(키·$SHA) 등록
              echo "packaged ${ATTEMPT_ID} sha=${SHA}"
          volumeMounts:
            - { name: workspace, mountPath: /workspace, readOnly: true }   # ★ 읽기전용 = 조작 불가
      volumes:
        - name: workspace
          persistentVolumeClaim:
            claimName: workspace-exam-<N>          # 그 attempt가 쓰던 PVC
```

---

## 8. 남은 결정 / TODO
- [ ] **batches/attempts/attempt_events/hosted.slots 마이그레이션** 작성(철칙 1: `db/migrations/00NN_*.sql`), `attempt_status` ENUM, `hosted` schema 생성
- [ ] **관리자 대시보드 API**: 회차 생성·로스터·연장(`deadline_at`)·강제제출 (docs/2 §13)
- [x] **동시 세션 정책 확정**: 한 attempt **동시 1세션**(새 세션 활성화 시 이전 무효화, §5 케이스표) — 부정행위·혼란 방지. 잔여 = 구현 시 grace·충돌 UX(이전 세션에 "다른 기기에서 접속됨" 통지)
- [ ] **PVC StorageClass·노드풀**: RWO 재스케줄 제약 대비(학생 노드 전용 + 적절 SC)
- [ ] **자동저장 주기**: VS Code auto-save 초 + (선택) PVC→MinIO 스냅샷 주기
- [ ] **마감 자동 회수 잡 오케스트레이션**: exam-ops가 deadline 스윕 → 미제출 패키징
- [ ] **MinIO 버킷 정책**: exam-hidden 학생 차단, artifacts/chatlogs 서버 전용 쓰기
- [ ] **보존 기간**: artifact/chatlog 보관 정책(법적·용량), 만료 정리

## 한 문장 정리
**PVC는 시험 중 안전망, 영구본은 MinIO(산출물)+Postgres(메타). 브라우저가 죽어도 서버에 상태가 남아 재로그인이 곧 복귀이고,
제출을 안 눌러도 마감 자동 회수가 작업물을 지킨다 — 어느 경우에도 학생 결과는 유실되지 않는다.**
