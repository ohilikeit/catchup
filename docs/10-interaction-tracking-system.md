# 상호작용 추적 시스템 (Interaction Tracking System) — v2

**상태**: 계획 (재작성)
**작성**: 2026-06-19 · v2로 전면 교체 (v1 클라이언트 hook 설계 폐기)
**대상**: CatchUP AI 테스트 평가 플랫폼
**목표**: 시험 *과정 중* 학생 작업물·대화를 시계열로 캡처해 MinIO에 봉인하고, 과정 평가에 활용

> **v1이 왜 폐기됐나** (상세: [10-interaction-tracking-system-review.md](10-interaction-tracking-system-review.md) §12)
> v1은 학생 컨테이너 안 Claude Code hook으로 스냅샷을 찍고 신규 3테이블·증분 알고리즘을 두려 했다. 세 가지가 틀렸다:
> ① 클라이언트가 만든 증거는 `trust='unverified'` — [0009_drop_byod.sql](../db/migrations/0009_drop_byod.sql)이 그 경로를 **삭제**했고 스키마가 저장을 거부한다.
> ② 제출 시 MinIO 적재·대화 캡처는 **이미 구현돼 있다**([docs/5](5-storage-submission-pipeline.md), [submissions.ts](../apps/web/lib/db/repositories/submissions.ts), [collector](../experiments/s1-docker-spike/collector/collect.mjs)).
> ③ 증분 스냅샷은 측정된 용량 문제 없이 떠안는 과설계(대원칙 ③).
> **v2는 기존 서버측 파이프라인 위에 ① 프록시-턴 트리거 PVC 스냅샷 ② 문제별 제외 메타 ③ 과정 평가 연결만 얹는다.**

---

## 1. 핵심 원리

> **학생은 추적당하는 줄도 모른다. 학생 컨테이너 *바깥*의 서버 워커가, 작업물이 모이는 PVC를 턴 경계마다 읽어 MinIO에 봉인한다.**

- **추적 대상은 이미 한 곳에 모여 있다**: code-server의 모든 작업물(코드·Excel·산출물)은 VS Code auto-save로 PVC `/workspace`에 실시간 저장된다. 따로 모을 필요가 없다.
- **캡처는 단방향 pull**: 학생 컨테이너는 아무 데도 push하지 않는다. 바깥 워커가 PVC를 readOnly로 *읽는다*. 이는 [collector](../experiments/s1-docker-spike/collector/collect.mjs)가 transcript를 회수하는 방식과 동일하다.
- **신뢰는 서버가 만든다**(대원칙 ⑤): sha256 봉인을 서버 워커가 산출 → `trust='verified'`. 학생은 손댈 수 없다.

---

## 2. 아키텍처

```
┌─ 학생 Pod (격리) ─────────────────────────────────────────────┐
│  code-server + claude code                                     │
│   · 아는 것:  ANTHROPIC_BASE_URL=http://proxy:4000 + 가상키     │
│   · 모르는 것: MinIO·DB·인터넷 (egress 차단)                    │
│   · 하는 일:  /workspace(PVC)에 저장만. 아무 데도 push 안 함    │
└──────┬─────────────────────────────────────┬──────────────────┘
       │ LLM 트래픽만                          │ PVC (워커가 readOnly 마운트)
       ▼                                      ▼
┌─ LiteLLM 프록시 (Pod 밖) ──────┐   ┌─ 스냅샷 워커 (Pod 밖, exam-ops) ──────┐
│ · 진짜 키 보관·Sonnet 강제      │   │ · PVC readOnly 읽기                    │
│ · 응답 완료 감지 → 내부 API로   │──▶│ · tar(+제외) + sha256                  │
│   "턴 종료" 콜백                │   │ · → MinIO exam-snapshots/ (creds 여기)│
└────────────────────────────────┘   │ · → attempt_events 기록 (내부 API)    │
                                      └────────────────────────────────────────┘
                       │                              │
                       ▼ 내부 API (x-internal-secret) ▼
              ┌─ apps/web (통합 Next.js) ────────────────────┐
              │ /api/internal/attempts/turn   (턴 이벤트)     │
              │ /api/internal/attempts/snapshot (스냅샷 등록) │
              │   → exam.attempt_events (append-only)         │
              └───────────────────────────────────────────────┘
```

**컴포넌트**
| 컴포넌트 | 위치 | 역할 | 기존/신규 |
|---|---|---|---|
| LiteLLM 프록시 | Pod 밖 | 응답 완료 시 내부 API에 턴 종료 콜백 | 기존 + 콜백 추가 |
| 스냅샷 워커 | Pod 밖 (노드 로컬 companion Pod, attempt마다 1개) | PVC readOnly → tar+sha256 → MinIO + 이벤트 등록 | 신규 |
| 내부 API | apps/web | 턴·스냅샷 이벤트 수신 → `attempt_events` append | 신규(기존 패키징 콜백 패턴 재사용) |
| 패키징 Job | Pod 밖 | 제출/마감 시 최종 산출물 | **기존 그대로**([docs/5 §4·§7](5-storage-submission-pipeline.md)) |

---

## 3. 보안 모델 — 4겹 방어

> 핵심 질문: "샌드박스가 우리 MinIO에 접근하게 되는 것 아닌가?" → **아니다. 학생 컨테이너는 MinIO의 존재 자체를 모른다.**

| 계층 | 방어 | 근거/선례 |
|---|---|---|
| **자격증명** | 학생 컨테이너에 MinIO endpoint·creds **0개** | 진짜 Anthropic 키를 안 주는 것과 동일 ([compose:37](../experiments/s1-docker-spike/docker-compose.yml)) |
| **위치** | MinIO를 쓰는 워커는 학생 Pod **바깥** (별도 워크로드) | [docs/5 §7](5-storage-submission-pipeline.md) 패키징 Job이 이미 별도 Pod |
| **네트워크** | 학생 Pod egress = 프록시로만. MinIO·DB·인터넷 차단 | compose에서 exam이 litellm-db에 link 없음 → k8s NetworkPolicy |
| **버킷 정책** | `exam-snapshots`는 서버 워커만 쓰기(IAM) | [docs/5 §2](5-storage-submission-pipeline.md) "학생 pod은 MinIO에 직접 쓰지 않는다" |

⚠️ **k8s 함정**: 같은 Pod 안 사이드카는 학생 컨테이너와 네트워크 네임스페이스(localhost·Pod IP)를 공유한다 → 스냅샷 워커를 학생 Pod *안에* 두면 안 된다. 반드시 별도 워크로드로 둔다(§7).

설령 학생이 code-server를 탈출해도: MinIO 주소를 모르고(자격증명) → 알아도 네트워크가 막혀 있고(네트워크) → 뚫어도 익명 쓰기가 막혀 있다(버킷 정책).

---

## 4. 트리거 설계 — 턴 전용 (프록시 턴 + debounce)

요구: "채팅 입력 시 + AI 응답 완료 시" 스냅샷. 이를 **서버측에서** 잡는다.

```
1. 학생이 프롬프트 전송 → 프록시 통과 → AI 응답 완료
       프록시 success 콜백 → POST /api/internal/attempts/turn
         → attempt_events(type='turn', detail={turnIndex, model, ...})  ← 항상, 싸게
         → 해당 attempt에 "스냅샷 보류(pending)" 표시

2. 스냅샷 워커(이벤트 기반):
       턴 신호 수신 시  if (now - lastSnapshot >= DEBOUNCE) → 스냅샷 실행
                        else 보류 유지(다음 자격 시점에 1장으로 합침)
```

- **DEBOUNCE**(기본 30s): 턴이 연달아 빠르게 와도 스냅샷은 최대 30초당 1회 → tar 폭주 방지.
- **HEARTBEAT 없음**: 고정 주기 스냅샷은 두지 않는다. 유휴 구간(예: 학생이 30분 자리 비움)에 동일 스냅샷을 반복 적재하는 낭비를 막기 위함 — 과정 추적은 *변화*를 잡는 것이고 변화는 턴 근처에서 생긴다.
  - PVC 자체 유실 대비는 **이 시스템의 일이 아니다** — k8s PVC 재부착·VS Code auto-save·마감 자동회수로 [docs/5 §5·§6](5-storage-submission-pipeline.md)가 따로 책임진다.
  - 턴 없이 한 수동 편집(예: 대화 없이 Excel만 20분 편집)은 **다음 턴/제출 때 누적분으로** 잡힌다. 그 사이의 중간 해상도가 필요하다고 파일럿에서 관측되면 §12의 "변화 감지 틱"(옵션 B)을 얹는다.
- **턴 인덱스 연결**: 각 스냅샷은 직전 턴 인덱스를 메타에 기록 → "몇 번째 대화 직후의 작업물"인지 평가에서 복원 가능.

> 프록시가 트리거의 단일 근거인 이유: 모든 prompt/response가 프록시를 지나고, 학생이 조작할 수 없다. "AI 응답 완료"를 신뢰성 있게 아는 유일한 지점이다.

**LiteLLM 콜백 연결 (결정)**: LiteLLM **custom logging callback**(`async_log_success_event`)을 등록한다. 응답 성공 시 `/api/internal/attempts/turn`으로 POST(x-internal-secret). **async**라 학생이 받는 응답 지연이 없다.
**가상키 → attempt 매핑 (결정)**: 가상키 발급 시 **LiteLLM 키 metadata에 `{attemptId}`를 박는다**. 콜백 페이로드가 그 metadata를 그대로 들고 오므로 별도 매핑 테이블이 필요 없다 — 매핑이 키와 함께 따라다닌다.

---

## 5. 데이터 모델 — 신규 테이블 0개

스냅샷은 제출 *이전*의 과정 산출물이라 `submission_files`(submission_id 필요)에 못 넣는다. 대신 **이미 있는 append-only 시계열 테이블** [`exam.attempt_events`](../db/migrations/0003_exam.sql)를 그대로 쓴다. `type`에 CHECK가 없어 `'turn'`·`'snapshot'`을 바로 쓸 수 있다.

```sql
-- db/migrations/00NN_attempt_snapshots.sql  (철칙 1: append-only 새 파일)
BEGIN;

-- 1) 문제 버전에 스냅샷 설정(불변) — 재현·공정성. problem_versions는 불변 스냅샷이므로
--    설정도 버전에 묶어 "그 시험 당시 규칙"이 영구 고정된다(Codex MEDIUM 지적 반영).
ALTER TABLE exam.problem_versions
  ADD COLUMN snapshot_config JSONB NOT NULL DEFAULT
    '{"enabled": true, "excludePatterns": [], "debounceSec": 30}'::jsonb;

-- 2) 스냅샷 이벤트 빠른 조회용 부분 인덱스(전체 attempt_events 중 type='snapshot'만)
CREATE INDEX idx_attempt_events_snapshot
  ON exam.attempt_events (attempt_id, created_at)
  WHERE type = 'snapshot';

COMMIT;
```

**스냅샷 1건 = MinIO 객체(실체) + attempt_events 1행(포인터+메타)**
```jsonc
// exam.attempt_events 한 행
{
  "type": "snapshot",
  "attempt_id": "…",
  "detail": {
    "seq": 7,                          // 그 attempt 내 스냅샷 순번
    "ref": "exam-snapshots/<attemptId>/0007-<ts>.tgz",  // MinIO 키
    "sha256": "…",                     // 서버 워커가 산출(봉인)
    "sizeBytes": 184320,
    "trigger": "turn",                 // 'turn' (현재 유일) | 'change-tick'(옵션 B, 향후)
    "turnIndex": 12,                   // 직전 대화 턴
    "fileCount": 23
  }
}
```
→ `type='snapshot'` 행을 시간순으로 모으면 그대로 **과정의 타임라인**이 된다. 평가용 쿼리는 부분 인덱스로 빠르게.

---

## 6. MinIO 레이아웃

기존 버킷([docs/5 §2](5-storage-submission-pipeline.md))에 `exam-snapshots`를 추가한다. 과정 스냅샷은 보존 기간이 짧을 수 있어 **별도 버킷 + 자체 lifecycle**로 분리한다.

```
minio/
├── exam-scaffold/      ← 입력: 문제 골격 (기존)
├── exam-hidden/        ← 서버 전용 (기존)
├── exam-artifacts/     ← 출력: 최종 제출 zip (기존)
│   └── <attemptId>/artifact.tgz
├── exam-chatlogs/      ← 출력: 최종 대화 정규화 (기존)
└── exam-snapshots/     ← ★ 신규: 과정 스냅샷 시계열
    └── <attemptId>/
        ├── 0001-<ts>.tgz
        ├── 0007-<ts>.tgz
        └── …
```
- 쓰기 권한: 스냅샷 워커만. 학생 Pod·code-server는 접근 불가.
- lifecycle: 채점 완료 + N일 후 만료(§12에서 보존정책 확정).

---

## 7. 스냅샷 워커

학생 Pod **바깥**의 별도 워크로드. tar 도구 + mc(MinIO client) + MinIO creds 보유. 학생은 이 워크로드에 접근할 수 없다.

**PVC 마운트 — 결정: 노드 로컬 companion Pod (attempt마다 1개)**

학생 Pod을 띄울 때 exam-ops가 **스냅샷 companion Pod을 함께 생성**한다. 이 Pod은:
- **별도 Pod** = 학생과 네트워크 네임스페이스 분리(§3 보안 충족). 같은 Pod 안 사이드카가 **아니다**.
- **`podAffinity`(requiredDuringScheduling)로 학생 Pod과 같은 노드에 강제 배치** → 같은 워크스페이스 PVC를 **RWO readOnly**로 공동 마운트(RWO는 동일 노드 내 다중 Pod 마운트 허용).
- attempt 수명 동안 상주하며 턴 신호(debounce 적용)에 반응해 tar. attempt 종료 시 companion Pod도 정리.

> ⚠️ **왜 literal DaemonSet이 아닌가**: DaemonSet Pod의 볼륨 목록은 시작 시점에 고정된다 → 나중에 동적으로 생기는 attempt별 PVC를 마운트할 수 없다. 노드 단위 DaemonSet이 모든 attempt를 처리하려면 `hostPath`로 kubelet 볼륨 디렉터리(`/var/lib/kubelet/pods/...`)를 직접 들여다봐야 하는데, 이는 privileged·CSI 드라이버 의존·blast radius 확대라 시험 격리 요건에 부적합. **per-attempt companion Pod**이 "노드 로컬 + 별도 워크로드 + 동적 PVC 대응"을 동시에 만족하는 정확한 형태다.

**캡처 절차(멱등)**
```sh
# 워커가 attempt X, seq N에 대해:
tar czf /tmp/snap.tgz -C /workspace \
    --exclude-from=<problem_versions.snapshot_config.excludePatterns> .   # ← 제외 적용
SHA=$(sha256sum /tmp/snap.tgz | cut -d' ' -f1)
mc cp /tmp/snap.tgz "minio/exam-snapshots/<attemptId>/$(printf %04d N)-<ts>.tgz"
# 내부 API로 등록 (실패 시 재시도; seq+ref가 키라 재실행 멱등)
POST /api/internal/attempts/snapshot  { attemptId, seq:N, ref, sha256, sizeBytes, trigger, turnIndex }
```
- **readOnly 마운트** = 학생 작업에 영향 0, 조작 불가 → `trust='verified'`.
- **멱등**: (attemptId, seq)가 키. 재시도해도 같은 객체 덮어쓰기 → 중복 행 방지.
- **성능**: node_modules 등 제외 시 워크스페이스는 보통 수~수십 MB. full tgz로 충분(증분 불필요 — §1 / review §12.5).

---

## 8. 추적 제외 목록 관리

문제마다 추적 대상이 다르다는 요구를 **두 겹**으로 처리한다.

1. **기본 제외(하드코딩)**: 환경/빌드 산출물은 항상 제외.
   `node_modules/**`, `.venv/**`, `__pycache__/**`, `.git/**`, `.next/**`, `dist/**`, `build/**`, `*.lock`, `.claude/**`
2. **문제별 제외(불변 메타)**: `exam.problem_versions.snapshot_config.excludePatterns`에 정의(§5). 버전에 묶여 시험 당시 규칙이 영구 고정.
3. **제공 파일 자동 스킵**: 제공 PDF·CSV 등은 scaffold(`exam-scaffold/<problem>/`)에 이미 있고 안 변한다. 워커가 **scaffold 파일과 sha256이 동일한 파일을 자동 스킵**하면, 제외 목록에 일일이 안 적어도 불변 제공물은 빠진다(용량 절감 + 의미 없는 추적 제거).

> "기본 제외(항상) + 문제별 제외(등록) + scaffold 동일 해시 자동 스킵" — 세 겹으로 사용자의 "기본은 다 찍되 환경/제공물은 빼라"를 충족.

---

## 9. 과정 평가 연결

평가 모듈(별도 트랙, `grading` schema)이 다음을 함께 소비한다:
- `exam.attempt_events`의 `type='snapshot'` 시계열 → 작업물이 **언제 어떻게 변했나**
- 각 스냅샷의 `turnIndex` → 대화 턴과 작업물 변화의 **인과 정렬**
- 최종 `chat-log.v1.json`(기존 collector 산출) → 대화 전문
- 특정 파일(예: `result.xlsx`) 추적: 스냅샷 시계열에서 그 파일만 추출·비교 → 결과물의 진화 재구성

```
snapshot seq3 @turn5  → result.xlsx (초안)
snapshot seq7 @turn12 → result.xlsx (수식 추가)
snapshot seq9 @turn15 → result.xlsx (최종)
   → "학생이 5→12→15턴에 걸쳐 어떻게 완성했나"를 과정 점수에 반영
```

---

## 10. 구현 단계 & 일정

| Phase | 작업 | 산출물 | 예상 |
|---|---|---|---|
| 0 | 설정·스키마 | `00NN_attempt_snapshots.sql`, `env.ts`에 MinIO 스냅샷 버킷·worker 시크릿 | 0.5일 |
| 1 | 내부 API | `/api/internal/attempts/turn`·`/snapshot` (x-internal-secret, 봉투 `{success,data,error}`) | 1일 |
| 2 | 프록시 콜백 | LiteLLM success 콜백 → 턴 종료 POST, 가상키→attempt 매핑 | 1일 |
| 3 | 스냅샷 워커 | companion Pod 이미지(tar+sha256+mc) + podAffinity 매니페스트 + 턴 신호 수신·debounce 처리, exam-ops가 학생 Pod과 함께 생성/정리 | 2일 |
| 4 | 제외·자동스킵 | 기본 제외 상수 + problem_versions 설정 로드 + scaffold 동일해시 스킵 | 1일 |
| 5 | 검증 | 내부 API 단위테스트, 워커 통합테스트(로컬 MinIO), 격리 검증(학생 컨테이너에서 MinIO 도달 불가 확인) | 1.5일 |
| | **합계** | | **~7일** |

> 제출 시 적재·대화 정규화·`submission_files`·패키징 Job은 **건드리지 않는다**(기존 동작 유지).

---

## 11. 위험 & 완화

| 위험 | 영향 | 완화 |
|---|---|---|
| **PVC RWO 동일노드 제약** | 워커가 다른 노드면 RO 마운트 불가 | companion Pod에 `podAffinity`로 학생과 동일노드 강제(§7). RWO=`ReadWriteOncePod`이면 못 씀 → 워크스페이스 PVC는 classic RWO로 프로비저닝 |
| **턴 폭주 → tar 과다** | I/O·용량 증가 | DEBOUNCE 30s + scaffold 동일해시 스킵 |
| **워커 다운 중 턴 발생** | 스냅샷 누락 | pending 플래그는 DB(attempt 단위) → 워커 복귀 후 다음 턴에 1장으로 합쳐 캡처. 최악도 제출 패키징이 최종 상태 보장 |
| **프록시 콜백 유실** | 턴 이벤트 누락 | 최종 backstop = 제출/마감 패키징 Job(최종 상태 무조건 캡처, [docs/5 §4·§5](5-storage-submission-pipeline.md)). 중간 해상도 보강 필요 시 §12 옵션 B |
| **가상키→attempt 매핑 오류** | 엉뚱한 attempt에 기록 | 발급 시 매핑 고정, 콜백에서 검증 |
| **스냅샷 용량 폭증** | MinIO 저장소 | lifecycle 만료 + 제외/자동스킵 + (필요시) content-addressed dedup |

---

## 12. 미결정 / TODO

- [x] **PVC 마운트 방식 확정**: ✅ 노드 로컬 **per-attempt companion Pod**(podAffinity 동일노드 + RWO readOnly 공동 마운트). 잔여 = 워크스페이스 PVC를 classic RWO(`ReadWriteOnce`, not `ReadWriteOncePod`)로 프로비저닝하도록 [3-s2-k8s-skeleton.md](3-s2-k8s-skeleton.md) 매니페스트에 반영
- [x] **가상키 → attempt 매핑**: ✅ LiteLLM 키 metadata에 `{attemptId}` 박기(별도 테이블 없음, 콜백이 들고 옴). 잔여 = 키 발급 코드에 metadata 주입
- [x] **트리거/빈도**: ✅ 턴 전용 + DEBOUNCE 30s 시작값. HEARTBEAT 폐기. 잔여 = 파일럿 실측 후 `snapshot_config.debounceSec` 조정(문제별 가능)
- [x] **스냅샷 보존정책**: ✅ 계층 분리 — 과정 스냅샷(`exam-snapshots`)은 **채점 완료 + 이의신청 기간 후 MinIO lifecycle 자동 만료**, 최종 산출물/대화는 더 길게(기존). 잔여 = **정확한 일수(예: 30~90일)는 운영·법무 확인** (개인정보)
- [x] **프록시 콜백 형태**: ✅ LiteLLM **async custom logging callback**(`async_log_success_event`) → `/api/internal/attempts/turn` POST. 잔여 = LiteLLM 버전별 콜백 API 확인
- [ ] **(옵션 B) 변화 감지 틱**: 턴 사이 수동 편집의 중간 해상도가 필요하다고 파일럿에서 관측되면 추가 — N분마다 mtime만 싸게 검사, 진짜 바뀐 경우에만 tar(유휴 낭비 없음). 턴 전용 위에 순수 추가
- [ ] **과정 평가 스키마**: grading 모듈이 snapshot 시계열을 읽는 인터페이스(별도 트랙)

---

## 13. 참고

- 스토리지·제출 파이프라인(이 설계의 토대): [docs/5](5-storage-submission-pipeline.md)
- 시험 환경·trust·정규화: [docs/2](2-exam-environment.md)
- DB 스키마(attempt_events·submission_files): [reference/02](reference/02-db-schema.md), [0003_exam.sql](../db/migrations/0003_exam.sql)
- byod 제거(클라 업로드·unverified 폐기): [0009_drop_byod.sql](../db/migrations/0009_drop_byod.sql)
- 대화 회수·봉인 선례: [collector/collect.mjs](../experiments/s1-docker-spike/collector/collect.mjs)
- 격리·가상키 선례: [docker-compose.yml](../experiments/s1-docker-spike/docker-compose.yml), [proxy/config.yaml](../experiments/s1-docker-spike/proxy/config.yaml)
- v1 폐기 사유 전문: [10-interaction-tracking-system-review.md](10-interaction-tracking-system-review.md) §12

---

**작성**: 2026-06-19 · Opus 4.8 (코드 검증 기반) · v2(턴 전용 프록시 트리거 + 서버측 캡처, companion Pod)
