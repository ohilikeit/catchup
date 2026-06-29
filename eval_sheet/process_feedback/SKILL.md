---
name: process-feedback
description: >-
  채점이 끝난 한 응시건(attemptId)의 결과 점수(result.json)와 과정 점수(협업 5축)를 입력으로,
  리포트 섹션 03("나에게 맞는 AI 활용법")의 계속활용/보완/새시도 3버킷 피드백을 생성하고,
  V2.0 리포트 HTML의 섹션 03을 자동으로 채운다. 다음이면 거의 항상 이 스킬을 써라:
  "이 응시자 피드백 만들어줘", "섹션 03 생성", "채점 끝난 건 코칭 코멘트 뽑아줘",
  "어느 턴이 점수에 영향 줬는지 근거 달아 강점/보완 정리해줘", "리포트 HTML에 활용법 채워줘".
  핵심은 *이미 산출된 점수를 라우팅*해 소수 슬라이스만 병렬로 깊게 조사·종합하는 것이지
  채점 자체나 출제가 아니다 — 채점은 grade.py, 출제는 assignment-factory에 맡겨라.
---

# process-feedback — 점수 라우팅 기반 섹션 03 피드백 생성 스킬

> 설계 근거 전문: [`overview.md`](overview.md). 이 SKILL.md는 그 설계의 **실행 진입점**이다.
> 이 스킬이 만드는 것: `out/<attemptId>/section03.jsonl`(중간 산출) → 그것으로 V2.0 리포트 HTML 섹션 03 자동 채움.

## 1. 정체성 (한 줄)

학생 한 명의 **결과 점수(result.json) + 과정 점수(협업 5축)** 가 "어느 턴·어느 셀·어떤 행동 유형을 볼지"를
결정적으로 라우팅하고, 라우팅이 지목한 좁은 슬라이스에만 병렬 investigator를 띄워 라벨을 *고른* 뒤,
종합기가 점수로 랭킹해 **3버킷 × 파트당 ≤2개**(0 허용)의 근거-앵커 피드백으로 확정한다.

## 2. 관통 철학 (불변식 — 타협 금지)

`overview.md §0`의 불변식 7개를 그대로 따른다. 요지:

1. **점수 정본 = 최종 `result.json` 하나.** 재채점 중간점수·랭킹키는 학생에게 노출 금지(내부 Δ·우선순위로만).
2. **인용 = `chat-log` substring 주입.** LLM이 따옴표를 생성하지 않는다.
3. **숫자(점수·턴번호·diff) = 결정적 산출물에서 주입.** LLM/judge는 산문 슬롯만.
4. **강점/보완 = 점수연결(`scoreRefs≠null`) / 제안 = 점수무관(`scoreRefs=null`).** 과정축은 *prior(가중)*일 뿐 단독 근거 불가.
5. **judge는 라우팅이 좁힌 영역에서 라벨을 고르고 present만 판정.** 윈도우·점수·polarity·카탈로그 밖 라벨 발명 금지.
6. **fan-out 전 증거-가용성을 결정적으로 게이팅.** 증거 없는 후보엔 judge 비용 0.
7. **근거 없으면 비운다.** 빈 버킷 허용, 억지 4스텝 금지. mock=live=task 세 backend가 동일 출력 계약.

## 3. 기본값

| 키 | 값 | 근거 |
|---|---|---|
| 동시성 상한 | 6 investigator | overview §6.3 |
| 버킷당 최대 | 2 (0 허용) | overview §2 |
| judge backend | `mock`(CI·기본) / `http`(production) / `task`(저작·보정) | overview §6.2 |
| 재채점 격리 | `mktemp -d`(grade.py CWD 고정 회피) | overview §4.1 |
| 빈 템플릿 폴백 | 켜짐(파일 부재 EXIT=1 방지) | overview §4.1 |
| 절대 점수 곡선 | **학생 노출 금지**(Δ만) | overview §4.1 |

## 4. 파이프라인 (S1~S6, 얇게 — 상세는 `overview.md`·`references/`)

```
S1 전처리(결정적)   재채점→scoretrack / 청킹→turnchunks / chat-log→turns 정본   [router/preprocess.py — 일부 TODO]
S2 라우팅(결정적)   result.json(Map A)+협업축(Map B) → routing_plan + 증거게이트  [router/route.py + catalog.py + evidence_gate.py]
S3 fan-out(병렬)    needsJudge 후보별 investigator ×N (mock/http/task)            [router/mock_investigator.py | references/investigator.md]
S4 종합(결정적)     입장게이트·present화해·mirror·쿼터·랭킹·선별 → part_decision  [router/decide.py]
S5 서술(LLM 슬롯만) 4스텝 조립 + 산문 슬롯 + G1~G4·GB1 게이트 → section03.jsonl   [references/synthesizer.md + router/gates.py]
S6 렌더(결정적)     section03.jsonl → V2.0 HTML 섹션 03 자동 채움                  [render/render_html.py]
```

- **결정적 vs LLM:** S1·S2·S4·S6 = 100% 결정적. **S3 judge(라벨 선택·present)와 S5 산문 슬롯만 LLM.**
- **얇은 본문 원칙:** 각 단계 규칙·표는 본문에 두지 않고 `overview.md`/`references/`에 위임(assignment-factory 컨벤션).

## 5. 실행 — 실제 attempt 입력 필수 (데모/폴백 데이터 없음)

> ⚠️ **이 스킬은 실제 입력을 요구한다. 없으면 폴백하지 않고 멈춰 요구한다.** 코드에 mock 입력 데이터를
> 박아두지 않는다(테스트 fixture는 `tests/`에 격리, CI에서만 `--backend mock`로 명시 사용).

**오케스트레이터(메인 Claude) 순서:**

1. **입력 해소.** 채점 끝난 `attemptId`로 실제 입력을 모은다 → `out/<attemptId>/inputs/`:
   `result.json`(grade.py 정본), `process-axes.json`(협업 5축, 섹션02 생성기),
   `turns.json`(chat-log.v1.json user-turn 정본), `ctx.json`(S1 재채점·청킹 파생 신호).
2. **없으면 요구.** 필수(`result.json`·`turns.json`·`ctx.json`) 중 하나라도 없으면 파이프라인이
   `MissingInputError`로 *무엇이 없는지* 알리고 멈춘다 → 사용자에게 그 입력을 요청하거나 S1 전처리부터
   돌린다. **임의 값으로 채워 진행하지 않는다.** `process-axes.json` 부재는 콜드스타트일 때만
   `--cold-start`로 명시 인정(그때만 Map B 중립).
3. **본 실행.**
   ```bash
   python -m eval_sheet.process_feedback.router.pipeline \
     --inputs out/<attemptId>/inputs --out out/<attemptId> \
     --backend task --generated-at "$(date -u +%FT%TZ)"   # [--cold-start]
   ```
   `routing_plan.json`·`part_decision.json`·`section03.jsonl`(서술 슬롯은 **비어 있음**: `needsNarration=true`) 생성.
4. **서술 채움(S5, 유일 LLM 경계).** `--backend task`면 needsJudge 후보를 `references/investigator.md`로
   병렬 Task(동시성 ≤6, 격리), 이어 `references/synthesizer.md`로 각 item의 산문 슬롯을 채운다(인용·점수·diff는 주입).
   production은 `--backend http`(LiteLLM temp0). 채운 뒤 `gates.py`(G1~G4·GB1) 통과분만 남긴다.
5. **렌더(S6).** 서술이 채워진 뒤에만:
   ```bash
   python eval_sheet/process_feedback/render/render_html.py \
     --jsonl out/<attemptId>/section03.jsonl \
     --template "CATCHUP AX AI 역량 검사 리포트_V2.0_AX팀 공유용.html" \
     --out out/<attemptId>/report.filled.html
   ```
   렌더는 `needsNarration=true`(스켈레톤) item이 남아 있으면 **거부**한다(빈 카드 방지).

**테스트(CI 전용):** `--backend mock --narration eval_sheet/process_feedback/tests/fixtures/narration.mock.json`
+ `--inputs eval_sheet/process_feedback/tests/fixtures/inputs` 로 결정성 회귀를 돌린다. **운영 경로 아님.**

## 6. 산출물 위치

```
out/<attemptId>/
  scoretrack.json     # S1 재채점 타임라인 (내부 전용, 절대점수 비노출)
  turnchunks.json     # S1 턴 before→after 청킹 (result.json 집합차분)
  turns.normalized.json  # S1 chat-log user-turn 정본
  routing_plan.json   # S2 결정적 라우팅 (probe·needsJudge·증거게이트)
  findings/<cid>.json # S3 investigator verdict (병렬, 격리)
  part_decision.json  # S4 파트별 결정 (입장게이트·mirror·쿼터·랭킹)
  section03.jsonl     # S5 최종 피드백 (렌더 입력 — schema/section03.schema.md)
  report.filled.html  # S6 V2.0 HTML 자동 채움 결과
```

## 7. 참조 색인

| 무엇 | 어디 |
|---|---|
| 설계 전문·라우팅 규칙·엣지 | [`overview.md`](overview.md) |
| JSONL 출력 계약 | [`schema/section03.schema.md`](schema/section03.schema.md) |
| 24유형 카탈로그(라우팅 메타) | [`router/catalog.py`](router/catalog.py) |
| investigator 프롬프트(judge) | [`references/investigator.md`](references/investigator.md) |
| synthesizer 프롬프트(서술) | [`references/synthesizer.md`](references/synthesizer.md) |
| 자동 채움 대상 DOM | V2.0 HTML `<section order:5>` `.guide-card` |

## 8. 확장 (타 문제 이식)

24유형 카탈로그는 `contract_expiry_tracking` 그라운딩이다. 타 문제는 그 문제 `eval/`의
`result.json` 필드·`intention.md` 함정에 맞춰 `catalog.py`의 `fireWhen`/`srcField`/`evidenceNeed`만
교체한다(코드 불변). assignment-factory 출제 산출물에 카탈로그를 동봉하는 통합은 `overview.md §10` TODO.

> **경계:** 이 스킬은 *피드백 생성·렌더*만 한다. 채점(`grade.py`)·과정점수 산출(섹션02 생성기)·
> 스냅샷 봉인(docs/10 워커)은 상류 트랙이며 이 스킬은 그 산출물을 **readOnly 소비**한다.
