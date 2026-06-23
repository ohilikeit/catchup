# 11 — 회차별 AI 모델 선택 (per-round model selection)

> 상태: **구현·검증·로컬 k3s 배포 완료**(9b0be93). typecheck·build·helm 렌더·in-cluster migrate·
> web→litellm /v1/models 도달 확인 / ArgoCD Synced·Healthy·web 롤아웃 완료. 작성 2026-06-23.
> 선행: [docs/0](0-how-it-works.md)(동작 원리)·[docs/2](2-exam-environment.md)(시험 환경)·
> [reference/03](reference/03-cache.md)·[reference/04](reference/04-user-role.md)·[reference/05](reference/05-security.md).
> 현재 모델 강제 구조(SSOT)는 `infra/litellm/config.yaml`·`catchup-helm`·`deploy/local-k3d` 에 구현돼 있고
> 이 문서는 그 "단일 강제값"을 "**허용 집합 + 회차별 선택**"으로 확장한다.

## 1. 요구사항

관리자가 **회차(batch)** 단위로 학생에게 제공할 AI 모델을 고를 수 있어야 한다.

- **선택 시점**: 회차 **생성 시** 모델을 지정(`batches.model` 저장) + **"시험 환경 열기"(provision)** 버튼에서 재확인/변경.
- **표시 정합성**: 학생 IDE 의 switch-model 피커·활성 모델·실제 호출 모델이 **모두 선택값과 일치**(소비자 기만 0). docs/0 의 "강제" 원칙 유지 — 학생은 회차에 지정된 모델만 쓸 수 있다.
- **allowlist**: 선택 가능한 모델은 **설정 한 곳**에서 관리. 초기값 = `claude-haiku-4-5` **단일**. 모델 추가 = allowlist config 한 줄 + litellm 재배포.
- **기본값**: `claude-haiku-4-5`.

### 비목표 (이번 범위 밖)
- **동시 다회차 서로 다른 모델**: 단일 StatefulSet + 전역 `hasBusySlots` 가드(현 불변식)상 동시에 한 회차만 open → "회차당 모델 1개"만 지원. 동시 멀티모델은 멀티 StatefulSet 도입(별도 과제).
- 슬롯별(학생별) 모델: 회차당 1키 공유 구조라 슬롯 단위 분기 없음.

## 2. 현재 구조와 확장점

```
[관리자] 회차 생성(capacity·budget·warm) ─▶ batches(DB)
[관리자] "시험 환경 열기" ─▶ openBatchEnvAction ─▶ provisionBatch(batchId)
   provisionBatch 가 회차당 만드는 3 채널:
     ① 가상키 generateVirtualKey()          ← LiteLLM /key/generate
     ② exam-batch ConfigMap (envFrom)        ← SCAFFOLD_REF/PROBLEM_ID/BATCH_ID
     ③ applyObject 리소스들(slot svc 등)
   그리고 scale 0→N 으로 pod 를 새로 띄움.
[LiteLLM] model_list 가 모델 강제(현재 단일).
[exam pod] ANTHROPIC_MODEL(정적 env) + /etc/claude-code/managed-settings.json(피커).
```

**확장 원리**: 모델을 위 3 채널에 얹는다 — 새 인프라 없이 기존 회차당 메커니즘 재사용.

| 채널 | 현재 | 확장 |
|---|---|---|
| ① 가상키 | 예산만 | `models:[회차모델]` 추가 → **서버측 회차 강제** |
| ② exam-batch CM | 문제/회차 메타 | `ANTHROPIC_MODEL`/`SMALL_FAST` 추가 → 활성 표시 |
| ③ applyObject | slot 라우팅 | `exam-claude-config`(피커)를 회차마다 갱신 |

## 3. SSOT 재정의 — 단일값 → 허용 집합

`examPlatform.litellm.model`(단일) → 아래 둘로:

```yaml
examPlatform:
  litellm:
    # 선택 가능한 모델 집합(SSOT). [0] = 기본값. 모델 추가는 여기만.
    allowedModels:
      - anthropic/claude-haiku-4-5
    # (파생) litellm model_list = allowedModels 각각 / web 드롭다운·검증 = 이 목록
```

- **litellm config**: `model_list` 가 `allowedModels` 각 항목(exact-match — 대시보드 모델별 집계 유지, 빈 model 행 방지).
- **web(드롭다운+검증)**: helm 이 `EXAM_ALLOWED_MODELS`(콤마 구분)·`EXAM_DEFAULT_MODEL` 을 web pod env 로 주입. 앱은 이 목록으로 UI 채우고 **서버측 재검증**(대원칙 5⑤ — 클라 입력 적대적).
- 현재 `allowedModels` 가 1개라 드롭다운 옵션도 1개 — 메커니즘은 완성, 모델 추가는 config 한 줄.

## 4. 데이터 모델

새 마이그레이션 `db/migrations/00NN_batch_model.sql` (철칙 1 — append-only):

```sql
ALTER TABLE exam.batches
  ADD COLUMN model TEXT NOT NULL DEFAULT 'claude-haiku-4-5';
COMMENT ON COLUMN exam.batches.model IS '이 회차의 AI 모델(litellm model_name = exam ANTHROPIC_MODEL = 피커 모델). allowlist 검증은 앱 레이어.';
```

- **DB 는 NOT NULL DEFAULT 만** — 허용 목록은 deploy config(allowlist)라 DB CHECK 로 박지 않음(설정-DB 결합 회피). 멤버십 검증은 앱.
- `batchesRepo.Batch` 에 `model: string` 추가, `LIST_SELECT`/`mapBatch`/findById 반영.

## 5. 구현 단계 (Phase)

### Phase 1 — 설정/SSOT (config)
- [ ] `catchup-helm` values 3종: `litellm.model` → `litellm.allowedModels:[anthropic/claude-haiku-4-5]`.
- [ ] `_helpers.tpl`: `catchup.allowedModelNames`(trim 목록)·`catchup.defaultModelName`([0]) 헬퍼.
- [ ] `templates/litellm.yaml`: `model_list` 를 `allowedModels` range 로 렌더.
- [ ] web 배포(common-helm extraEnvVars / 해당 위치): `EXAM_ALLOWED_MODELS`·`EXAM_DEFAULT_MODEL` 주입.
- [ ] `infra/litellm/config.yaml`(메인 게이트웨이)·`deploy/local-k3d/20-litellm.yaml`: 동일 allowlist 반영.

### Phase 2 — DB·Repo (backend 기반)
- [ ] 마이그레이션 `00NN_batch_model.sql` + `pnpm db:migrate`.
- [ ] `batchesRepo`: `Batch.model`, select/mapper, `createBatch` 입력에 model.
- [ ] `batchService.createBatch`/`updateBatch`: model 파라미터 + allowlist 검증(`lib/env` 의 allowedModels).
- [ ] `lib/env.ts`(또는 config): `EXAM_ALLOWED_MODELS`/`EXAM_DEFAULT_MODEL` 파싱·노출.

### Phase 3 — provision 배선 (examOpsService / examResources)
- [ ] `examBatchConfigMap(...)` 에 `ANTHROPIC_MODEL`/`ANTHROPIC_SMALL_FAST_MODEL` = `batch.model` 추가.
- [ ] 신규 `examClaudeConfigMap(ns, model)` 빌더(managed-settings.json) — `exam-claude-config`.
- [ ] `provisionBatch`: ① `generateVirtualKey({ models:[batch.model] })` ② `applyObject(exam-claude-config)` **scale-up 前** ③ exam-batch CM 모델 포함. (선택값은 `provisionBatch(batchId, { model? })` 로 개설-시 override 허용 → 없으면 batch.model)
- [ ] `generateVirtualKey` 에 `models?: string[]` 파라미터 추가(/key/generate `models`).

### Phase 4 — exam pod 템플릿 (정적 env 제거 — ⚠️ 함정)
- [ ] `catchup-helm/templates/exam-statefulset.yaml`: 정적 `ANTHROPIC_MODEL`/`SMALL_FAST` **제거** + `envFrom: configMapRef: exam-batch(optional)` 추가. managed-settings 마운트는 유지(이제 provision 이 회차마다 덮음).
- [ ] `deploy/local-k3d/40-exam.yaml`: 정적 `ANTHROPIC_MODEL`/`SMALL_FAST` **제거**(envFrom exam-batch 는 이미 있음). `exam-claude-config` 정적 CM 은 "기본/유휴값"으로 남기고 provision 이 갱신.
- ⚠️ **k8s env 우선순위**: 컨테이너 `env` 가 `envFrom` 보다 우선 → 정적 env 를 남기면 회차값이 안 먹는다. **반드시 제거**.

### Phase 5 — Admin UI
- [ ] 회차 생성 폼(`AdminBatchesClient`/`createBatchAction`): 모델 `Select`(allowlist, 기본 haiku). FormData `model`.
- [ ] `BatchEnvControls`(개설 버튼): 현재 `batch.model` 을 기본 선택한 `Select` + "이 모델로 환경 열기" 재확인. `openBatchEnvAction(batchId, model)`.
- [ ] `actions.ts`: `openBatchEnvAction` 이 model 받아 검증 후 `provisionBatch(batchId,{model})` + `batchService.updateBatchModel`(개설 시 변경분 영속).
- [ ] 회차 상세/목록에 현재 모델 뱃지 표시(`Tag`).
- [ ] 디자인 시스템 컴포넌트만 사용(`@app/ui` `Select`/`Field`/`Tag`) — raw 색·임의 Tailwind 금지(CLAUDE.md).

### Phase 6 — 검증
- [ ] `pnpm typecheck` + `pnpm build`(빌드 통과 = 완료 기준).
- [ ] helm 렌더(stub subchart): allowlist→litellm model_list·web env 파생 확인, exam-statefulset 정적 env 제거 확인.
- [ ] local-k3d YAML 파싱 + ArgoCD 동기화.
- [ ] 마이그레이션 적용(`pnpm db:migrate:status`).
- [ ] (가능 시) 회차 생성→모델 지정→개설→litellm `/v1/models`·키 `models` 제한·exam-batch env·exam-claude-config 일치 e2e 점검.

## 6. 리스크 / 함정
| 리스크 | 영향 | 완화 |
|---|---|---|
| 정적 env 가 envFrom 이김 | 회차값 무시 | Phase 4 에서 정적 ANTHROPIC_MODEL 제거(필수) |
| managed-settings subPath 미갱신 | 기존 pod 피커 안 바뀜 | provision 이 scale 0→N → 새 pod 가 흡수. CM 갱신을 scale-up 前에 |
| 임의 모델 문자열 주입 | litellm/키 오염 | 서버측 allowlist 재검증(5⑤) |
| 대시보드 모델별 집계 흐림 | 운영 가시성 | model_list exact-match 유지 + key-level models |
| claude-code 버전 | 피커 잠금 미동작 | ≥2.1.175(이미 2.1.186 핀) |
| allowlist 1종이라 선택지 없음 | UX 빈약 | 의도된 초기 상태 — config 로 확장 |

## 7. 롤백
- config(allowlist)·exam env 를 단일 haiku 로 되돌리면 현재 "haiku 강제" 상태와 동일.
- 마이그레이션은 append-only — 컬럼은 DEFAULT haiku 라 기존 회차·코드와 호환(컬럼 무시 시 기본 haiku).

## 8. 변경 파일 요약
- DB: `db/migrations/00NN_batch_model.sql`
- Repo/Service: `apps/web/lib/db/repositories/batches.ts`, `apps/web/lib/services/batchService.ts`, `apps/web/lib/env.ts`
- provision: `apps/web/lib/services/examOpsService.ts`, `apps/web/lib/k8s/examResources.ts`, `apps/web/lib/litellm/keys.ts`
- helm: `_helpers.tpl`, `templates/litellm.yaml`, `templates/exam-statefulset.yaml`, `{local,alpha,prod}-applications-values.yaml`, web env 주입 지점
- local-k3d: `20-litellm.yaml`, `40-exam.yaml`
- infra: `infra/litellm/config.yaml`
- UI: `admin/batches/AdminBatchesClient.tsx`, `admin/batches/actions.ts`, `admin/batches/[id]/BatchEnvControls.tsx`, `admin/batches/[id]/actions.ts`, 상세/목록 뱃지
- knowledge: `knowledge/operations/how-it-works.md`(모델 회차별로 갱신)
