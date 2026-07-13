---
type: Architecture Overview
title: 스토리지 · 제출 파이프라인 · 재접속 안전망
description: 학생 작업물이 어디에·어떻게 저장되고, 제출이 어떻게 영구화되며, 사고가 나도 환경으로 완벽히 복귀하는지 정의.
resource: file:///docs/5-storage-submission-pipeline.md
tags: [storage, minio, pvc, submission, packaging, reconnect, safety]
timestamp: 2026-07-13T00:00:00Z
---

# 스토리지 · 제출 파이프라인 · 재접속 안전망

## 핵심 한 줄

진행 중 작업물 = PVC(임시 안전망) / 최종 산출물 zip = MinIO / 제출 메타·점수 = Postgres.
브라우저는 언제 꺼져도 되는 일회용 — 진짜 상태는 서버(pod·PVC·DB)에 있어 재로그인하면 같은 슬롯으로 100% 복귀.

## 데이터 3분류 → 3계층 저장

| 데이터 | 저장소 | 수명 | 비고 |
|---|---|---|---|
| 진행 중 `/workspace` (코드·편집상태) | **PVC** (pod별) | 시험 중만 | crash 안전망. 끝나면 wipe |
| 최종 산출물 zip, 대화 정규화 JSON | **MinIO** (객체 스토리지) | 영구 | 큰 바이너리. DB에 넣지 않음 |
| 제출 메타·status·해시·MinIO키 | **Postgres** | 영구(정보원) | 구조화·채점·조회 |

흐름:
```
시험 중:   code-server ──저장──→ PVC(/workspace)        ← 임시, crash 보존
제출/마감: 서버 Job ── tar+sha256 ──→ MinIO(artifact)   ← 영구 산출물
                  └ transcript 정규화 ─→ MinIO(chatlog)
                  └ 메타·키·해시·status ─→ Postgres      ← 영구 정보원
정리:      accepted 확정 → pod scale-down → PVC wipe (영구본은 이미 안전)
```

원칙: 큰 파일은 DB에 넣지 않는다. **MinIO에 실체, Postgres엔 포인터(키)+해시+메타**.

## MinIO 버킷 구조

⭐ **단일 버킷 `catchup-bucket`(private)** — 운영 제약상 버킷은 1개만. 용도별 구분은 그 버킷 안의
최상위 폴더(키 접두)로 한다. 정본: `apps/web/lib/storage/buckets.ts`(`STORAGE_BUCKET` + `BUCKETS` 접두).

```
catchup-bucket/            ← 유일 버킷(private, 익명 접근 none)
├── exam-scaffold/         ← 입력: scaffold (학생 환경에 시드, 읽기)
│   └── <code>/v<n>/<name>
├── exam-artifacts/        ← 출력: 제출 코드 zip
│   └── <회차명>/<학생명_이메일-attempt8>/workspace.tgz
├── exam-chatlogs/         ← 출력: 대화 정규화 JSON
│   └── <회차명>/<학생명_이메일-attempt8>/chatlog.tgz
└── exam-snapshots/        ← 출력: 시험 중 과정 스냅샷 시계열(docs/10)
    └── <회차명>/<학생명_이메일-attempt8>/<ts>.tgz
```

- ref = `<접두>/<키>`(예: `exam-artifacts/…`) = 실 객체 키와 1:1 일치 → DB 포인터·호출부 무변경.
  storageService 가 실 버킷(`catchup-bucket`)에 `<접두>/<키>`로 쓰고, Job 의 `mc cp`는 `m/catchup-bucket/<ref>`.
- 학생 pod은 MinIO 자격증명이 없어 직접 쓰지 못함 — 서버(Job/앱)측 패키징만 (클라 조작 차단).
- 키 명명: uuid 나열 금지, 사람이 읽는 경로 사용.
- ⚠️ hidden-tests 버킷(`exam-hidden`)은 제거됨 — 저장만 되고 채점이 소비하지 않던 미구현 기능이라
  버킷/업로드 경로를 걷어냈다. 히든 채점을 도입하면 `catchup-bucket/exam-hidden/` 접두 + prefix IAM 으로 재도입.

## Postgres 핵심 테이블 (정본: db/migrations/)

> 컬럼명은 실제 마이그레이션(`db/migrations/`) 및 코드(`apps/web/lib/db/repositories/`)에서 확인한 값 기준.

- `exam.batches`: 회차 (`id`, `org_id`, `problem_version_id`, `name`, `capacity`, `status`, `scheduled_at`, `llm_budget_usd` — `budget_per_attempt` 아님, `warm_count`, `mode`, `window_start_at`/`window_end_at`)
- `exam.attempts`: 응시 (`batch_id`, `examinee_id`, `status` CHECK `ready|running|submitted|expired|void`, `deadline_at`, `trust`). ⚠️ slot 컬럼 없음 — 슬롯 매핑은 `hosted.slots.attempt_id`로 격리
- `exam.submissions`: 제출 1건 (`attempt_id` UNIQUE, `status` `received→validating→accepted/rejected`, `captured_via='proxy'`, `trust='verified'`, `tool`, `chat_format_version`, `validation_error`)
- `exam.submission_files`: 실물 메타 (`submission_id` FK, `kind='artifact'|'chat_log'`, `storage_key`, `sha256`, `size_bytes`)
- `exam.attempt_events`: 모든 전이 append-only (`started`, `heartbeat`, `reconnect`, `submitted`, `auto_collected`, `force_submitted`, `deadline_extended`, `voided`, `slot_assigned_from_queue` 등)
- `hosted.slots`: pod 슬롯 상태 (`batch_id`, `slot_no` PK, `attempt_id` UNIQUE, `state` CHECK `down|warming|ready|assigned|submitting|recycling`, `endpoint`, `last_heartbeat_at`, `virtual_key`)
- `hosted.entry_queue`: 입장 대기열 (`attempt_id` PK, `batch_id`, `enqueued_at`) — `0013` 마이그레이션

가상키 spend: LiteLLM이 자기 DB(`litellm`)에 자동 집계 → 대시보드는 `/key/info`로 읽음 (별도 exam 테이블 불필요).

가상키 spend: LiteLLM이 자기 DB(`litellm`)에 자동 집계 → 대시보드는 `/key/info`로 읽음 (별도 exam 테이블 불필요).

정본 마이그레이션: `db/migrations/0003_exam.sql`, `0004_hosted.sql`, `0005_ops.sql`, `0008_slot_window_states.sql`, `0012_slot_virtual_key.sql`

## 정상 제출 파이프라인

```
1. 상단 타이머          ← 앱이 attempts.deadline_at로 남은시간 계산 (서버 기준)
2. deadline 도달       → 앱이 접속 차단 → 제출 페이지
3. [제출 버튼]         → 서버측 패키징 Job 생성:
     a. PVC(/workspace)를 readOnly 마운트 → tar + sha256 → MinIO(exam-artifacts)
     b. claude/ 디렉터리 (Claude Code 대화 JSONL, PVC subPath 영속화) → MinIO(exam-chatlogs)
     c. Postgres: submission(received→validating→accepted), submission_files(키·해시)
4. accepted 확정       → attempt.status='submitted' → pod scale-down → PVC wipe
```

⚠️ 패키징은 반드시 서버측 (학생 pod 밖에서 PVC를 readOnly로). 학생이 zip 조작 불가 → `trust='verified'`.
⚠️ 취합(패키징) 먼저, scale-down 나중 — 역순 절대 금지.

## 패키징 Job 실제 구현 요약

> ⚠️ 아래는 실제 코드(`apps/web/lib/k8s/examResources.ts` `packagingJob`)를 기준으로 정리. 초안 스켈레톤과 구조가 다름.

실제 구현 특징:
- **이미지**: 전용 packager 이미지 없음 — `busybox:1.36`(pack·report) + `minio/mc:latest`(upload) 3단계 initContainer/container 분리
- **backoffLimit**: `2` (초안의 3이 아님)
- **ttlSecondsAfterFinished**: `3600` (1시간 후 자동 정리)
- **이중 캡처**: `project/` 디렉터리(작업물) → `exam-artifacts/{경로}/workspace.tgz` / `claude/` 디렉터리(대화 JSONL) → `exam-chatlogs/{경로}/chatlog.tgz` (claude/ 없으면 생략)
- **키 구조**: uuid 나열 대신 `{회차명}/{학생명_이메일로컬-attempt8}/workspace.tgz` 형태 가독성 경로
- **report 단계**: busybox `wget`으로 `/api/internal/submissions/package` 콜백 (전용 이미지 불필요)
- **securityContext**: `runAsNonRoot: true, runAsUser: 1000, fsGroup: 1000`

fail-soft: 패키징 실패가 제출 자체를 막지 않음. 콜백 경로: `/api/internal/submissions/package`.

## 재접속 안전망

**핵심 원리**: 브라우저는 버려도 되는 일회용 클라이언트. 진짜 상태는 전부 서버에 있음:
- **pod + PVC**: code-server는 서버에서 돌고, 작업물은 PVC에 있음 → 브라우저 닫아도 열린 파일·터미널·작업물 그대로
- **DB (`hosted.slots.attempt_id`)**: "학생 A의 attempt → slot_no" 매핑이 DB에 있음 → 재로그인하면 앱이 같은 슬롯으로 연결
- **DB (`attempts.deadline_at`)**: 제한시간은 서버 기준 → 재접속해도 시간이 정확히 이어짐

재접속 시퀀스:
```
학생이 탭/브라우저 닫음
  → exam pod 계속 살아있음. /workspace(PVC) 작업물 유지
  → 학생 재로그인
  → 앱: examinee_id로 "진행 중 attempt" 조회 (status=running, deadline 안 지남)
  → hosted.slots에서 attempt_id → slot_no 확인 → iframe 재프록시 (websocket 재연결)
  → 화면 복구: 열려있던 파일·터미널·작업물 그대로, 타이머 = deadline_at − now
  → attempt_events에 'reconnect' append (디바운스 5분)
```

| 사고 | 복구 |
|---|---|
| 탭/브라우저 닫음 | pod·PVC·세션 서버에 살아있음 → 재로그인 → 같은 슬롯 복귀 |
| 새로고침(F5) | websocket 재연결, code-server 세션 유지 |
| 네트워크 일시 끊김 | 자동 재연결 |
| 다른 기기 재접속 | 재로그인 → 같은 attempt/슬롯. ⚠️ 동시 1세션 정책: 새 세션 활성화 시 이전 세션 무효화 |
| pod crash | k8s 자동 재시작 → **같은 PVC 재부착** → 작업물 보존, 잠깐 끊겼다 복귀 |
| 노드 장애 | pod 다른 노드로 재스케줄 (⚠️ PVC RWO 노드 묶임 주의) |
| 마감까지 제출 버튼 안 누름 | **서버가 자동 회수** → 작업물 보존 |

## 마감 자동 회수 (제출 버튼 의존 제거)

```
[close 시점] 앱이 deadline 지난 attempt 전수 점검
  → 미제출(status≠submitted) attempt도 패키징 Job을 서버가 자동 실행
  → MinIO+Postgres에 저장, attempt_events에 'auto_collected'
  → 그 다음에야 scale-down (취합 먼저, 폐기 나중)
```

트리거 경로 (코드 확인: `apps/web/lib/services/examService.ts`):
- 학생 화면 만료 → `GET /api/exam/{attemptId}/expire` → `expireExam` → `autoCollectAttempt` (서버 마감 재판정·즉시 회수)
- close 직전 `sweepDeadlines(batchId)` (`examOpsService.closeBatch` 내부, 화면 끈 학생 안전망)
- 수동: `POST /api/internal/exam-ops/sweep` · `exam-ops.sh sweep`
- 관리자 강제 제출: `forceSubmit(attemptId, actorId)` → `attemptService.ts`

제출 버튼 = 명시적 확정, 자동 회수 = 누락 방지 안전망. 둘 다 둔다.

## 데이터 손실 방지 — 다층 방어

| 위협 | 방어 |
|---|---|
| 파일 미저장 | VS Code auto-save(N초) → PVC 즉시 기록 |
| 브라우저 종료 | 서버측 code-server 세션 + PVC |
| pod crash | k8s 재시작 + PVC 재부착 |
| 노드 장애 | PVC 재스케줄 (노드풀·SC 설계) |
| 제출 누락 | 마감 자동 회수 |
| 산출물 조작 | 서버측 패키징 + sha256 봉인 |
| PVC 유실 대비 (선택) | N분마다 PVC→MinIO 스냅샷 (autosave 이벤트) |

# Citations

- 원본: `docs/5-storage-submission-pipeline.md`
- 관련 설계: [exam-environment](/operations/exam-environment.md), [exam-serving](/operations/exam-serving.md)
- 스토리지 코드: `apps/web/lib/storage/storageService.ts`, `apps/web/lib/storage/client.ts`, `apps/web/lib/storage/buckets.ts`
- 패키징 콜백: `apps/web/app/api/internal/submissions/package/route.ts`
- 제출 서비스: `apps/web/lib/services/examService.ts` (`autoCollectAttempt`, `sweepDeadlines`)
- 슬롯 repo: `apps/web/lib/db/repositories/slots.ts`
- 시도 repo: `apps/web/lib/db/repositories/attempts.ts` (`recordReconnectIfStale`)
- 마이그레이션 정본: `db/migrations/0003_exam.sql`, `db/migrations/0004_hosted.sql`
