# CatchUP 성향 측정 프로토타입 (chat-only · LLM-only)

학생의 **채팅 발화(`role=user` 턴)** 만 측정해 4축 성향을 산출하는 프로토타입.
설계의 단일 진리원천은 [`../measurement-design.md`](../measurement-design.md) 이며,
이 코드는 그 §2(표시 규약)·§3(2단 채점)·§4(커버리지 게이트)·§5(축별 루브릭)·§6(출력 스키마)를 구현한다.

> 상태: **내부 연구(internal research) 전용**. `scoring_meta.internal_only=true`. 설계 §7 검증
> (잔차화·동의·코호트 보정)을 통과하기 전에는 학생에게 % 를 노출하지 않는다.

## 두 가지 아키텍처 철칙

1. **mock 없음 · 실제 LLM만.** 판사(judge)는 **항상 실제 Anthropic Messages API**를 호출한다.
   오프라인 휴리스틱·mock 판사 모드는 존재하지 않는다.
2. **정규식 의미 판정 없음.** 모든 *의미* 분류(계획정의/생성요청, scope, 요구항목,
   ④ phase=general/post_error/post_success 등)는 **LLM이** 한다. 코드에 `re` import가 없다.
   - 합법적인 **결정적 카운트/집계**(턴 수 세기, LLM 라벨 세기, 발화 길이 중앙값)는 유지한다 —
     이는 "규칙이 센다/점수 매긴다"(설계 §3)이지 정규식 의미 판정이 아니다.
   - ① 앵커는 **LLM이 라벨한 pre-build 계획 턴 수**만 쓴다(과거 `planning_keywords` 정규식 신호 제거).

## 모델 · 자격증명

- API: `POST https://api.anthropic.com/v1/messages` (urllib 표준 라이브러리, pip 의존성 없음).
  헤더 `x-api-key`, `anthropic-version: 2023-06-01`. `temperature=0`.
  구조화 출력은 `tools` + `tool_choice`(축별 `report_axis` 강제)로 받고 `tool_use.input`을 읽는다.
- **키 로드 순서:** ① 환경변수 `ANTHROPIC_API_KEY` → ② 없으면 repo 루트 `../../.env.secret`의
  `ANTHROPIC_API_KEY=...` 줄(따옴표 제거). **키 값은 출력·로그·커밋하지 않는다.**
- 선택 오버라이드: `ANTHROPIC_BASE_URL`(기본 `https://api.anthropic.com`),
  `MODEL`(기본 `claude-haiku-4-5`). 모델 id가 거부되면 API 오류 원문을 그대로 보고한다.

## 실행

```bash
python3 run.py fixtures/architect.jsonl   # 설계자형 → P-D-S-M (고-% 극)
python3 run.py fixtures/sprinter.jsonl    # 스프린터형 → E-G-C-R (반대 극)
python3 run.py fixtures/gated.jsonl       # 게이트형 → ④ 관여 측정불가('—')
```

축당 LLM 콜 1회(총 4콜, anti-halo). 출력은 설계 §6.2 JSON(`ensure_ascii=False`, pretty).
파일 없음 → `파일을 읽을 수 없습니다: <path> (ENOENT)` exit 1. 키/네트워크/모델 오류 → 한글 메시지 exit 1.

## 파일

| 파일 | 역할 |
|---|---|
| `parse.py` | JSONL → `{turns, user_turns}`. assistant 텍스트는 text 블록만(`tool_use` 드롭). 정규식 phase 판정 없음. |
| `prompts.py` | 4축 프롬프트(한국어) + 축별 tool `input_schema`. ④는 phase·intent를 LLM이 맥락으로 판정. |
| `judge.py` | `classify_axis(axis, session)` — 축당 1콜, 실제 API. `{axis, band, evidence, coverage, turn_labels}`. |
| `features.py` | LLM 라벨 + 길이에 대한 결정적 카운트/집계. 정규식 없음. |
| `score.py` | 밴드 → 연속 %(설계 §3 표준식, `jround=floor(x+0.5)`), 커버리지 게이트(§4·§5), 표시 규약(§2). |
| `run.py` | CLI 오케스트레이터(항상 라이브). §6.2 산출. |
| `fixtures/` | architect / sprinter / gated 3개 페르소나 트랜스크립트. |

## 콜드스타트 / internal_only 주의

- `cohort_n=1`: 코호트 분포가 없으므로 밴드-상대 정규화 `[c_lo,c_hi]`는 합리적 기본값(폭 0.2)을 쓴다.
  정확한 % 는 코호트가 쌓이면 보정된다(설계 §3·§7.3) — **이 단계의 % 는 예비치다.**
- 신뢰도 순위 ③ > ① > ②(위임) > ④. ④는 신호가 희박해 가장 자주 게이트된다(설계 §7.4).
- `residualized_vs_passfail=false`·`internal_only=true` 동안 학생 노출 금지(설계 §7).
