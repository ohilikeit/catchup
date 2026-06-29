# 섹션 03 "나에게 맞는 AI 활용법" — 점수 라우팅 기반 사후 피드백 생성 설계 (overview.md)

> **상태:** 설계 v3 (점수 라우팅 + Claude Code Skill + 병렬 investigator + 2-tier 검출판). 구현 코드 아님 — 이 flow를 결정적·재현 가능·환각 없이 짤 청사진.
> **v2와의 관계:** v2의 5단계 골격·24유형 카탈로그·G1~G4는 유지하되, **사후 점수 라우팅 레이어를 1급 산출물로 승격**하고, 세 관점(라우팅·skill·2-tier)의 적대적 비평으로 드러난 사실오류·과설계를 교정했다. 변경 요약은 §0 끝.
> **위치:** `grading` 트랙의 사후(post-hoc) 배치 워커 + 그 워커를 만들고 보정하는 Claude Code Skill. 채점 완료(result.json 적재) **후** 트리거. 학생 Pod 밖, readOnly 소비.
> **형제 트랙:** 채점([`grade.py`](../../problems/general/3.contract_expiry_tracking/eval/grade.py)) · 성향측정([`mbti/measurement-design.md`](../mbti/measurement-design.md)). 셋 다 같은 봉인 산출물을 읽지만 **이 트랙만 스냅샷 tgz 시계열 + 채점 결과 + 협업축을 함께 소비**한다.
> **채우는 docs/10 TODO:** [`docs/10-interaction-tracking-system.md` §12](../../docs/10-interaction-tracking-system.md)의 *"과정 평가 스키마: grading 모듈이 snapshot 시계열을 읽는 인터페이스"*.

---

## 0. 설계 철학

**한 줄 요지:** 결과 점수(`result.json` 8필드·FP/FN·무결성)와 과정 점수(협업 5축)는 **이미 산출돼 있다.** 그러므로 30턴을 맹목 스캔하지 않는다 — **점수가 "어느 턴 윈도우·어느 셀·어느 카탈로그 유형을 볼지"를 결정적으로 사들이고(라우팅), 라우팅이 지목한 좁은 영역에 대해서만 증거가 실재할 때 judge를 병렬로 띄워 라벨을 *고르며*, 종합기가 점수로 랭킹해 파트당 ≤2개로 확정한다.** 구현은 langgraph 스크립트가 아니라 Claude Code Skill이며, 판단부는 병렬 investigator로 fan-out한다.

이 설계가 따르는 불변식 7개(타협 금지):

1. **점수 정본 = 최종 `result.json` 하나.** 재채점 중간 점수·재계산 랭킹키는 **학생에게 절대 노출 금지**(내부 Δ·우선순위 근거로만). 헤드라인 점수는 정본 result.json에 앵커.
2. **인용 = `chat-log` substring.** judge가 따옴표 문장을 *생성*하지 않고 *주입*받는다.
3. **숫자(점수·턴번호·diff·랭킹키) = 결정적 산출물에서 주입.** judge·LLM은 산문 슬롯만 쓴다.
4. **강점/보완 = 점수연결(`scoreRefs≠null`), 제안 = 점수무관(`scoreRefs=null`).** 과정축은 *확증·가중·제안트리거*일 뿐 **단독 근거가 될 수 없다**(축만으로 "당신은 검증을 안 한다" 금지).
5. **judge는 라우팅이 좁힌 영역에서 라벨을 고르고 present를 판정할 뿐**, 윈도우·점수·polarity·카탈로그 밖 라벨을 발명 못 한다.
6. **fan-out 전에 증거-가용성을 결정적으로 게이팅한다.** "이 슬라이스에 그 verdict를 증거할 신호(인용·cellDelta·tool-call)가 실재하는가"를 통과 못 하면 judge를 띄우지 않는다(결정적으로 죽을 후보에 비용 0).
7. **근거 없으면 비운다.** 빈 버킷 허용, 억지 4스텝 생성 금지. mock=live=task 세 backend가 **동일 출력 계약**을 공유해 LLM 없이도 end-to-end 재현 가능(mbti `judge.py` 선례).

**v2 → v3 변경 (비평 교정):**
- (교정 A) `part2.무결성`이라는 필드는 **존재하지 않는다** — `grade.py`는 무결성을 `score["Part2_무결성(10)"] = max(0, 10 − (len(유령계약)+len(허용외대상유형))×0.5)`로만 파생한다(grade.py:193). 모든 라우팅 신호를 `part2.유령계약`·`part2.허용외대상유형`·`score["Part2_무결성(10)"]`로 정정.
- (교정 B) `score` 키는 **괄호 배점 접미사 포함**: `"Part1_계약대장(50)"`,`"Part2_F1(40)"`,`"Part2_무결성(10)"`,`"총점(100)"`. srcRef 화이트리스트는 이 정확 키와 대조.
- (교정 C) `load_sheet`가 `data_only=True`(grade.py:94)라 result.json은 **수식 여부를 못 본다.** 게다가 학생이 openpyxl/pandas로 쓴 수식 셀은 **캐시값이 없어 `data_only=True`가 None→빈칸=오답**으로 채점되기 쉽다 → "수식 존재 ∧ 필드 만점"은 거의 공존 안 함. 따라서 `DERIVE_FIELD` 강점은 **수식 읽기를 1급 증거로 쓰지 않고** 대화·cellDelta 증거에 앵커하며, 수식 읽기는 best-effort 보너스(불가 시 보수 강등).
- (교정 D) `norm_date`/`norm_int`/`norm_yn`이 표기차를 **흡수**(grade.py:54·38·69)하므로 정규화 성공은 셀정확도에 무영향 → `FORMAT_NORMALIZE`를 **점수무관(제안 톤)**으로 재분류. 점수연결은 `FORMAT_MISMATCH`(정규화 실패로 실제 오답)만.
- (교정 E) part2 F1은 집합 지표라 **per-contract로 분해 불가** → part2 weakness 랭킹은 "어느 계약이 N점"이 아니라 **토픽 단위 총량**으로 다룬다(무결성만 위반당 0.5점으로 per-item 분해 가능).
- (교정 F) 라우팅·종합은 **워커(Python, 게이트웨이 자격증명 보유)가 전부 추출**하고 investigator엔 **주입된 텍스트 패킷만** 준다(투명 격리). investigator는 MinIO/openpyxl에 안 닿는다 → judge 단위는 작아지고, **production은 Task가 아니라 LiteLLM HTTP**가 자연 형상(§6).

> **경계 한 줄:** 전처리(4)·라우팅(3 전반)·종합 선별·게이트는 전부 결정적. **judge(present 판정+라벨 선택)와 5단계 서술 슬롯만 LLM**이고, judge 입력은 닫힌 evidence 패킷, 출력은 닫힌 어휘이며, 게이트가 다시 결정적으로 검사한다.

---

## 1. 진입·입력 계약 — 모두 이미 존재

이 워커는 **결과 점수·과정 점수가 모두 산출된 뒤** 동작한다(사후 배치).

| 입력 | 위치 | 신뢰 | 무엇을 주는가 | 라우팅에서의 역할 |
|---|---|---|---|---|
| `result.json` (정본) | [`grade.py`](../../problems/general/3.contract_expiry_tracking/eval/grade.py) 산출 | **결정적 점수(유일 노출 점수원)** | `part1.{셀정확도,계약총수,필드별,오답상세}`·`part2.{F1,FP샘플,FN샘플,유령계약,허용외대상유형,…}`·`score` | **1차 신호(Map A)** |
| `process-axes.json` | grading 과정채점 트랙(섹션 02 생성기) | server-authored(LLM 파생) | 협업 5축 각 `{score(/10), cohortAvg, delta}` | **2차 신호(Map B)** — **신규 의존성, 미확정(§10 TODO)** |
| `chat-log.v1.json` | MinIO `exam-chatlogs/<attemptId>/` | verified(봉인) | user-turn 정본 + assistant 응답 + (가능시) tool-use | 인용·AI작업 귀속·`totalTurns` |
| `attempt_events type='snapshot'` | PG [`exam.attempt_events`](../../db/migrations/0003_exam.sql) | server-authored | `detail={seq,ref,sha256,trigger,turnIndex,fileCount}` | 스냅샷 시계열·재채점 대상 |
| 스냅샷 tgz | MinIO `exam-snapshots/<attemptId>/NNNN-<ts>.tgz` | verified(봉인) | `/workspace` 풀 스냅샷 | 재채점 입력 |
| 빈 템플릿 / 정답키 / `intention.md` | `data/`·`eval/` | 출제자 권위 | 재채점 폴백·`--answer-dir`·6함정 산문 | 폴백·카탈로그 근거 |

**`result.json` 실측 형상** (grade.py:143-196, 라우팅이 이 포인터만 신뢰):

```jsonc
{
  "part1": {
    "정확셀": 0, "전체셀": 0, "셀정확도": 0.86, "계약총수": 25,
    "필드별": { "계약명":1.0,"거래상대방":1.0,"계약유형":1.0,"시작일":0.96,
                "종료일":0.80,"계약금액":1.0,"자동갱신":1.0,"갱신통지일":0.92 },  // LEDGER_FIELDS 8키(grade.py:109)
    "오답상세": [ {"계약":"CT-2025-028","필드":"종료일","정답":"2026-09-01","제출":""} ]  // len<80 cap
  },
  "part2": {
    "정답대상수":0,"제출대상수":0,"정밀도":0.0,"재현율":0.0,"F1":0.78,
    "오탐_FP수":2,"누락_FN수":3,
    "유령계약": [["CT-9999-001","만료임박"]],          // [:50] cap, (계약,대상유형) 튜플
    "허용외대상유형": [],                                // [:50] cap
    "FP샘플": [["CT-2025-044","자동연장주의"]],         // [:20] cap
    "FN샘플": [["CT-2024-077","자동연장주의"]]          // [:20] cap
  },
  "score": { "Part1_계약대장(50)":43.0, "Part2_F1(40)":31.2, "Part2_무결성(10)":9.5, "총점(100)":83.7 }
}
```

> **샘플 절단 주의(라우팅 한계):** `오답상세`는 80개, `FP/FN샘플`은 20개, `유령계약/허용외`는 50개에서 잘린다. 오답이 cap을 넘는 **저득점자**는 라우팅이 anchor로 쓸 계약이 샘플에서 사라질 수 있다 → **집계(`필드별`/`F1`/score)는 항상 안전하지만 윈도우/anchor 해상은 lossy**. score_loss 랭킹은 집계로, 윈도우 지목은 "샘플 내 항목으로만"이라고 명시(§3.7).

**`process-axes.json` 가정(미확정):** 협업 5축 = `문제정의·AI출력검토·실행환경관리·완성및가치·불확실성관리`, 스케일 `/10`, `delta = score − cohortAvg`. 이 산출물의 정확 스키마·존재 여부는 섹션 02 생성기가 확정해야 한다. **부재/콜드스타트(코호트 없어 delta 미정)면 Map B는 `delta=0 중립`으로 폴백** → 라우팅은 1차 신호(result.json)만으로 동작(§3.4·§10).

---

## 2. 산출물 — 섹션 03의 구조

3분류 × 각 **최대 2개**(0 포함) 피드백 아이템 + 1개 전체 오버뷰.

| 분류 | 정의 | 점수 연결 | 데이터 불변식 |
|---|---|---|---|
| **강점 활용** | 계속 살리면 좋은 강점 | **필수**(만점/극복 필드에 닿음) | `scoreLinked=true`, `scoreRefs≠null` |
| **보완 필요** | 보완하면 좋을 점 | **필수**(감점 필드/오답/FP·FN/무결성위반에 닿음) | `scoreLinked=true`, `scoreRefs≠null` |
| **추가 제안** | 점수와 무관한 일반 권장 습관 | **무관(명시)** | `scoreLinked=false`, UI "점수와 무관" 배지 강제 |

각 아이템의 4스텝 근거 = **`[몇번째 대화 → AI작업 → 결과물 diff → 채점영향]`**. 위젯 4종(구간 돋보기·대화 흐름·관찰+채점영향·가이드 카드)은 v2와 동일. **세 분류가 항상 모두 나올 필요는 없다**(검증 통과 후보가 있는 버킷만).

> **섹션 02 ↔ 03 관계(확정):** 섹션 02(5축 점수 뷰)와 섹션 03(턴증거 3버킷 피드백)은 **형제 뷰**다. 02의 5축은 03의 **부모 키가 아니라** 라우팅의 **활성화 prior**(어느 후보를 먼저·강하게 보느냐)다(§3.4). 최종 `scoreLinked`·헤드라인 점수는 **result.json만** 정한다 — 축은 점수원이 아니다.

> **그라운딩 금칙:** 모든 예시는 실제 `grade.py`·`intention.md` 형상만. *"컬럼명 한글→영문화로 84.5점"* 금지(`grade_part1`이 한글 헤더를 dict 키로 씀 → 영문화 시 셀정확도 ~0 붕괴). *`=EDATE(시작일,12)`* 같은 한글 명명범위 가짜 예시 금지(실제는 `=EDATE(D2,12)`). 인과는 항상 "이 셀/대상이 틀려 `셀정확도`/`F1`/무결성이 이만큼".

---

## 3. ★ 점수 라우팅·파트별 후보결정 레이어 (이 설계의 심장)

> v2 3단계("전체 process를 한 컨텍스트로 후보 선정")의 **앞단(어디를 볼지)을 점수로 대체**하고, **뒷단(분류·선별)을 파트별 결정 로직으로 정밀화**한다. 사용자가 "심장"이라 지정한 부분이므로 가장 길고 세밀하게 설계한다.

레이어는 **5스텝 결정 흐름**이다 — (3.1) 카탈로그에 라우팅 메타를 박고 → (3.2) Map A로 결과신호를 probe로 → (3.3) 윈도우·산출물 지목 → (3.4) Map B로 축 prior 가중 → (3.5) **증거-가용성 게이트(fan-out 전)** → (3.6) judge 이후 파트별 후보결정·랭킹·선별. (3.7~3.9) 만점/빈약/불일치/충돌.

### 3.1 카탈로그 라우팅 메타 (라우팅을 데이터로 만든다)

24유형 각각이 "어느 점수 신호에서 발화하는가"를 자기 정의에 들고 있어야 라우팅이 결정적이다. §5 카탈로그의 각 행에 6필드를 박는다:

```jsonc
"DERIVE_FIELD": {
  "kind":"strength", "trap":5, "tier":"Hybrid",
  "srcField":"part1.필드별.종료일",            // 이 유형이 닿는 result.json 포인터
  "fireWhen":"필드별.종료일>=0.8 || overcomeΔ>0",// 결정적 발화 조건(Map A)
  "evidenceNeed":["dialogue:계산지시","cellDelta:종료일 빈칸→날짜"], // ★fan-out 전 게이트가 요구하는 슬라이스 신호
  "axisAffinity":["완성및가치","문제정의"],     // 이 유형을 보강하는 과정축(Map B)
  "mirror":"COMPUTE_MISS"                       // 같은 필드 반대극(§3.6 mirror 배타)
}
```

라우팅 로직은 카탈로그를 순회하며 `fireWhen`을 평가할 뿐 — 규칙이 코드에 하드코딩되지 않는다(유형 추가 = 카탈로그만 수정 = assignment-factory "축↔데이터 1:1·3곳 동반수정" 철학).

### 3.2 Map A — `result.json` → probe (1차 신호, 결정적)

각 행: "신호가 켜지면 → 이 산출물·윈도우·카탈로그 부분집합을 본다". **윈도우/산출물은 provenance 좌표일 뿐, 검사 증거는 result.json + chat-log substring**이다(셀을 다시 읽지 않는다 — overview의 no-xlsx 원칙).

| # | result.json 신호(발화 조건) | 지목 산출물(provenance) | 윈도우 결정법 | 카탈로그 부분집합 | 보강 축 |
|---|---|---|---|---|---|
| A1 | `필드별.종료일<1.0` & 오답상세에 종료일 제출=`""` | 계약대장·종료일열, 해당 `오답상세[].계약` | 그 계약 종료일이 마지막으로 채워졌거나 **방치된** 청크(방치형은 §3.5에서 무窓 처리) | `{COMPUTE_MISS(보완)}` | 완성및가치 |
| A2 | `필드별.종료일>=0.8` & scoretrack에 종료일 Δ>0 | 동상 | `오답상세_resolved`가 일어난 청크 | `{DERIVE_FIELD(강점)}` | 완성및가치·문제정의 |
| A3 | `필드별.계약금액<1.0` & 오답상세 제출∈{`0`,`별도`} & 정답=`""` | 계약대장·계약금액열 | 금액칸 채운 청크 | `{OVERFILL(보완)}` | 불확실성관리 |
| A4 | `필드별.계약금액==1.0` & 미기재 건 빈칸 유지 | 동상(열 전체) | 금액열 다룬 청크 | `{EMPTY_RESPECT(강점)}` | 불확실성관리 |
| A5 | 오답상세에 표기 흔적 오답(norm이 못 흡수한 날짜·금액) | 시작일·종료일·금액열 | 표기 오답 셀 채운 청크 | `{FORMAT_MISMATCH(보완)}` | 실행환경관리 |
| A6 | `필드별.{계약명,거래상대방,계약유형,시작일,자동갱신,갱신통지일}<1.0` | 해당 열 + `data/contracts/<계약>.pdf` | 기본칸 추출 청크(초반) | `{EXTRACTION_ERROR(보완)}` | 실행환경관리 |
| A7 | `FP샘플`∪`FN샘플`에 경계 계약(잔여 60/61·통지 30/31) | 대상목록 | Part2 대상 산출 청크 | `{BOUNDARY_SKIP(보완)↔BOUNDARY_PROBE(강점)}` | 문제정의 |
| A8 | `FN샘플`에 자동연장 계약 또는 `FP샘플`에 정상건 | 대상목록 + 자동갱신·갱신통지일열 | 갱신규칙 적용 청크 | `{RULE_UNDERREAD·OVER_INFER(보완)↔SPEC_GROUNDING(강점)}` | 문제정의·AI출력검토 |
| A9 | `유령계약≠[]` 또는 `허용외대상유형≠[]` (무결성<10) | 대상목록 계약번호·대상유형열 | 위반 행 도입 청크 | `{VERIFY_SKIP·OVER_INFER(보완)}` | AI출력검토 |
| A10 | `유령계약==[]` & `허용외대상유형==[]` & `제출대상수>0` (무결성=10) | 대상목록 | 전 구간(습관) | `{INTEGRITY_CLEAN(강점)}` | AI출력검토 |
| A11 | `F1` 高 & 경계·갱신 FP·FN 모두 0 | 대상목록 | 전 구간 | `{BOUNDARY_PROBE·SPEC_GROUNDING(강점)}` | 문제정의 |
| A12 | scoretrack: 후반 청크 `총점 Δ>0` 회복 & 직전 검증 발화 | 변화 셀들 | Δ>0 일어난 후미 청크 | `{SELF_AUDIT·INCREMENTAL_CHECK(강점)}` | AI출력검토 |

**score 상수(랭킹용, 결정적):**
- part1 한 필드 만점 기여 = `50/8 = 6.25`(셀정확도 = cells_ok/(계약총수×8), 한 필드 전건정답 = 계약총수/(계약총수×8)×50; 계약총수 무관 — grade.py:145·190 검증). **필드 score_loss = (1−필드별[f])×6.25.**
- part2 F1: `score["Part2_F1(40)"] = F1×40`. **F1 갭은 집합 지표라 per-contract 분해 불가**(교정 E) → weakness 랭킹은 part2 토픽(경계/갱신) 단위 총량 `(1−F1)×40`로만.
- part2 무결성: `Part2_무결성(10) = max(0, 10 − viol×0.5)`, viol = `len(유령계약)+len(허용외대상유형)`. **위반당 0.5점 → per-item 분해 가능.**

### 3.3 윈도우·산출물 지목 (결정적 역추적)

probe의 `오답상세[].계약`·`FP/FN샘플`의 계약번호를 `turnchunks`로 역추적해 **그 셀/대상이 변한 청크**를 윈도우로 붙인다. DEBOUNCE 30s로 단일 턴이 아니라 **구간**이며, 어긋나면 보수적으로 넓게(§4·§8). `artifact{file,sheet,cols,rows}`는 **provenance 라벨**일 뿐 — judge가 그 셀을 다시 읽지 않는다(값은 이미 result.json·cellDelta에 있다).

### 3.4 Map B — 5 협업축 → 활성화 prior (2차 신호)

축은 **방향(어느 역량이 약/강)**을, result.json은 **증거(어느 셀이 틀림)**를 준다. **축은 단독으로 후보를 만들지 못한다** — result 신호를 가중·확증하거나, result에 흔적이 없을 때만 제안(T3)을 연다.

| 축(delta) | 저점(delta<0): 더 본다(보완/제안 가중) | 고점(delta≥0): 강점 확증 가중 | 점수무관 제안(result 흔적 없을 때) |
|---|---|---|---|
| **문제 정의** | A7·A8 보완 가중(경계·갱신 규칙전달 실패) | A2·A11 강점 가중 | `NO_RULE_RESTATE`,`LATE_STRUCTURE` |
| **AI 출력 검토** | A9 무결성 + A5 표기 가중 | A10·A12 강점 가중 | `NO_FINAL_VERIFY` |
| **실행 환경 관리** | A6 추출오류 + `degraded` 스냅샷 + 직접편집 비중 | (해당 강점 적음) | `MANUAL_EDIT_HEAVY`,`REWRITE_CHURN` |
| **완성 및 가치** | 전반 셀정확도·F1 저하 + 최종대조 부재 | 전반 고점 확증 | `NO_INTERMEDIATE_SAMPLE`,`PREVIEW_FIRST_ABSENT` |
| **불확실성 관리** | A3 오버필 + A8 과추론 가중 | A4 빈칸존중 강점 가중 | `ONE_SHOT_DUMP` |

**가중 규칙(결정적, 동방향만):**
```
axisBoost = 1 + clamp(|delta|/10, 0, 0.5)   # 저점축↔보완/제안, 고점축↔강점 일 때만
역방향(저점축인데 강점, 고점축인데 보완) → 1.0(가중 없음); 충돌은 §3.9
process-axes.json 부재/콜드스타트 → 전 축 delta=0 → axisBoost=1.0 (Map A 단독 동작)
```

> **콜드스타트·비결정 입력 경고:** delta는 코호트 평균이 있어야 정의된다(첫 코호트엔 없음). 또 축점수는 **상류 LLM 루브릭 산출**이라 result.json 같은 봉인 결정값이 아니다 — 그래서 축은 **prior(우선순위)에만** 영향하고 polarity·점수는 절대 못 정한다(불변식 4). 이 경계가 "라우팅도 결정적"을 축의 비결정성으로부터 지킨다.

### 3.5 ★ 증거-가용성 게이트 (fan-out 전, 가장 중요한 추가)

probe가 결정적으로 발화해도, **그 verdict를 증거할 신호가 슬라이스에 실재하지 않으면 judge를 띄우지 않는다.** tier별로 결정적 선조건을 건다:

| tier | 증거-가용성 선조건(결정적) | 통과 못 하면 |
|---|---|---|
| **A (순수 결정적)** | `result.json` 필드 자체가 증거. fireWhen 참이면 항상 가용 | judge 불요 — 여기서 확정 |
| **Hybrid (A 앵커 + B 확인)** | A 앵커(점수) **AND** 슬라이스 신호(해당 셀의 cellDelta가 있는 청크 **또는** 그 셀을 지시한 user-turn) | judge 안 띄움 → **T2 score-only로 강등**(라벨 유지, 서술 보수화, "곧이곧대로 제출" 구제) |
| **B (내용검증)** | 슬라이스 내용(대화/cellDelta/코드파일)이 라벨을 *주장 가능*하게 실재 | **드롭**(발명 금지) |

이 게이트가 4개 비평 결함을 한꺼번에 막는다:
- **방치형 누락(omission)은 청크가 없다**(변화 이벤트 부재) → A1 같은 케이스는 윈도우 null → Hybrid면 자동으로 **T2 score-only**(최종 `오답상세` 제출=`""`만으로 보완 성립, judge 0). 무窓을 정직하게 처리.
- **수식 캐시 문제**(교정 C): `DERIVE_FIELD`의 `evidenceNeed`는 "계산 지시 대화 또는 빈칸→날짜 cellDelta"이지 **수식 읽기가 아니다.** 둘 다 없으면 강점 미성립 → 강등/드롭(만점이어도 "검토해서 맞춤" 날조 차단).
- **결정적으로 죽을 후보**(mirror 패자·polarity 반대극)는 게이트 **전에** 가지치기(§3.6) → judge 비용 0.
- **확증편향 패킷의 무력한 적대성** 문제는 적대적 triple 자체를 폐기(§5)하고, 대신 게이트가 "증거 실재"를 선결정.

### 3.6 파트별 후보 결정 로직 (judge 이후, 결정적 종합)

종합기가 probe·judge 출력을 받아 파트별로 결정한다.

**(공통) 입장 게이트 — 통과 못 하면 폐기:**
1. `part∈{strength,weakness}` ⇒ `scoreRefs≠null` & 포인터가 result.json에 실재.
2. `part==strength` ⇒ 해당 필드 만점(필드별=1.0) **또는** scoretrack Δ>0(극복). 감점 필드를 강점으로 못 씀.
3. `part==weakness` ⇒ 해당 필드 감점/FP·FN/무결성위반 실재.
4. `part==suggestion` ⇒ `scoreRefs==null` & `behaviorRefs≠null`.
5. **judge-present 화해(★ v2 미설계 보강):** Hybrid/B 후보는 judge `present==true` 필수. probe는 발화했는데 judge가 `present:false`면 → Hybrid는 T2 score-only 강등(점수 흔적이 진실), B는 드롭. `confidence`는 judge가 반환한 `{high,med,low}`를 `{0.85,0.6,0.35}`로 매핑.

**mirror 배타(fan-out 전 적용):** `COMPUTE_MISS↔DERIVE_FIELD`, `OVERFILL↔EMPTY_RESPECT`, `FORMAT_MISMATCH↔(FORMAT_NORMALIZE는 제안으로 분리)`, `BOUNDARY_SKIP↔BOUNDARY_PROBE`, `RULE_UNDERREAD↔SPEC_GROUNDING`, `VERIFY_SKIP↔INTEGRITY_CLEAN`. **같은 필드는 최종 result.json polarity로 한쪽만**(필드별=1.0→강점, <1.0→보완). 단 **부분점수 필드의 계약 입도 강점**(교정·v2 미설계 보강): 필드별<1.0이라도 scoretrack에 특정 계약의 Δ>0 극복이 있고 그 계약이 최종 `오답상세`에 없으면, **그 계약을 scoreRef로 한 극복형 강점**과 **여전히 틀린 다른 계약의 보완**이 **계약이 서로소일 때 공존 가능**(같은 필드라도 scoreRef 계약이 다르면 적법). polarity 배타는 "같은 필드 ∧ 같은 계약"에만 적용.

**파트별 랭킹키:**
```
strength:   priority = relSeverity_pos × confidence × (1+overcomeBonus) × axisBoost
weakness:   priority = relSeverity_neg × confidence × axisBoost
suggestion: priority = |delta| × signalStrength        # 점수 무관
```
- **relSeverity(교차지표 비교가능성, ★ v2 미설계 보강):** 6.25(part1)와 40(part2)를 한 큐에 정렬하면 part2가 구조적으로 지배(비평 §7-2). 그래서 **자기 지표군 내 정규화**: part1 필드는 `(1−필드별[f])`, part2 F1 토픽은 `(1−F1)`, 무결성은 `viol×0.5/10`. 전부 0..1 상대심각도. 추가로 **트랙 쿼터**: weakness 2슬롯 중 part1·part2 후보가 둘 다 있으면 **각 파트 최소 1슬롯 보장**(8필드 소액 다발이 단일 F1 dip에 밀리지 않게).
- `overcomeBonus = 0.5 if scoretrack 극복흔적 else 0`(극복형 강점이 가장 교육적).

**선별(파트당 ≤2, 0 허용):**
```
for part in [strength, weakness, suggestion]:
    C = [c for c in candidates if c.part==part and passes_entry_gate(c)]
    C = dedupe_by_label(C, keep=max(priority))     # 같은 label 1개
    C = apply_mirror_exclusion(C)                  # 위
    C = enforce_track_quota(C)                      # weakness part1/part2 최소 1
    C = sort_desc(C, key=priority)
    selected[part] = C[:2]
# 교차 파트 토픽 일관성(★ v2 미설계 보강):
selected = topic_consistency_pass(selected)
# 같은 (필드 또는 Part2토픽)이 강점·보완에 동시 등장하면 final polarity로 한쪽만,
# 단 §3.6 계약-서로소 예외는 유지(서술에 "일부 계약은 도출 성공/일부는 누락" 병치 명시)
```
**동률 타이브레이크:** priority 동률 → `window.start` 오름차순 → label 사전순.

### 3.7 만점·빈약·과정-결과 불일치·충돌 처리

| 상황 | 탐지(결정적) | 라우팅·결정 |
|---|---|---|
| **보완 0(전 필드 만점)** | 모든 필드별=1.0 & FP·FN=0 & 무결성=10 | weakness 빈 채로. 주의를 강점(극복형)+제안(T3)으로 재라우팅 |
| **불일치①: 축 저점·결과 만점** ★가장 교육적 | 예: `AI출력검토` delta<0 & 무결성=10 & F1高 | **보완 아님**(score_loss=0) → **제안(`NO_FINAL_VERIFY`)**, scoreLinked=false. "이번엔 깨끗했지만 제출 전 검증 발화가 없었다" |
| **불일치②: 축 고점·결과 감점** | 예: `문제정의` delta≥0 인데 종료일<1.0 | **축으로 강점 날조 금지.** 결과가 진실 → 그 필드는 보완. 고점축은 **다른 만점 필드** 강점 보강에만 |
| **만점인데 과정 엉성** | 총점高 & `totalTurns`≤3 또는 churn多 | 보완 0 → 제안(`ONE_SHOT_DUMP`/`REWRITE_CHURN`)만 |
| **과정 데이터 빈약(2~3턴)** | turnchunks 희박 & tool-call 귀속 0 | T1 불가 → T2 score-only로 강점·보완, 그래도 0이면 "과정 데이터 부족" 빈 상태 |
| **축 평균인데 과정이 흥미** | 모든 delta≈0 이지만 턴구조 신호 존재 | **T3는 축 극단과 무관하게** 턴구조 신호(churn·검증부재)로 독립 활성화 — 평균 학생도 제안 받음 |
| **degraded 스냅샷 구간** | scoretrack `degraded=true` | 그 구간 Δ를 보수적(인접 귀속). 극복 판정에 쓰지 않음 |
| **샘플 cap 초과(저득점)** | `len(오답상세)`=80 등 cap | score_loss는 집계로 안전. 윈도우 지목은 **샘플 내 항목으로만**, 나머지는 "다수 셀 누락"으로 집계 서술 |

### 3.8 산출 — `routing_plan.json` (100% 결정적)

```jsonc
{
  "attemptId":"att_…", "resultSha256":"…", "floorMasked":true,
  "axes": { "문제정의":{"score":9.0,"cohortAvg":8.5,"delta":0.5},
            "실행환경관리":{"score":7.0,"cohortAvg":7.6,"delta":-0.6}, "…":{} },  // 부재 시 전부 delta:0
  "probes": [
    { "id":"P1","rule":"A8","fireWhen":"FN샘플 ⊇ {CT-2024-077}",
      "tier":"B","kind":"weakness",
      "artifact":{"file":"expiry_targets_template.xlsx","sheet":"대상목록","cols":["계약번호","대상유형"]},
      "window":[18,23], "catalogSubset":["RULE_UNDERREAD","OVER_INFER","SPEC_GROUNDING"],
      "scoreRefs":["part2.FN샘플","part2.누락_FN수"],
      "evidenceReady":true,  // §3.5 게이트 통과
      "axisRef":{"name":"문제정의","delta":0.5}, "axisBoost":1.05, "needsJudge":true },
    { "id":"P2","rule":"A1","fireWhen":"필드별.종료일=0.80 & 오답상세 제출=\"\"",
      "tier":"Hybrid→T2","kind":"weakness",
      "artifact":{"file":"contract_ledger_template.xlsx","sheet":"계약대장","cols":["종료일"],"rows":["CT-2025-028"]},
      "window":null,  // 방치형 무窓 → score-only
      "catalogSubset":["COMPUTE_MISS"], "scoreRefs":["part1.필드별.종료일","part1.오답상세"],
      "evidenceReady":false, "needsJudge":false },
    { "id":"P3","rule":"A9","fireWhen":"유령계약=[[CT-9999-001,만료임박]]",
      "tier":"A","kind":"weakness",
      "scoreRefs":["part2.유령계약","score.Part2_무결성(10)"],
      "needsJudge":false }
  ],
  "judgeBudget":{"probes":3,"needsJudge":1,"droppedByEvidenceGate":1},
  "deterministic":true
}
```

### 3.9 산출 — `part_decision.json` (골격 결정적 / 라벨선택만 judge)

```jsonc
{
  "attemptId":"att_…", "headlineScore":{"총점(100)":83.7},  // 정본 앵커
  "decision": {
    "strength":[
      { "label":"DERIVE_FIELD","tier":"T1","window":[13,17],"scoreLinked":true,
        "scoreRefs":["part1.필드별.종료일"],
        "behaviorRefs":["turnchunks[0].resultDiff.오답상세_resolved[0]","turns#14"],
        "axisRef":{"name":"완성및가치","delta":0.4},
        "relSeverity":0.20,"overcome":true,"confidence":0.85,"priority":0.13,
        "rationale":"종료일 일부 계약을 시작일+기간으로 도출(빈칸→날짜 cellDelta+계산지시 대화)" } ],
    "weakness":[
      { "label":"RULE_UNDERREAD","tier":"solid","window":[18,23],"scoreLinked":true,
        "scoreRefs":["part2.FN샘플","part2.누락_FN수"],
        "behaviorRefs":["turnchunks[3]","turns#19"],
        "axisRef":{"name":"문제정의","delta":0.5},
        "relSeverity":0.22,"confidence":0.6,"priority":0.14,
        "rationale":"CT-2024-077 자동연장주의 누락(FN) → F1 하락" } ],
    "suggestion":[
      { "label":"NO_FINAL_VERIFY","tier":"process_only","window":[27,30],"scoreLinked":false,
        "scoreRefs":null,"behaviorRefs":["turns#27..30"],
        "axisRef":{"name":"AI출력검토","delta":0.5},
        "rationale":"제출 직전 검증/대조 발화 없음(점수무관)" } ]
  },
  "dissonance":[ {"type":"축저점·결과만점","axis":"실행환경관리(-0.6)","resultClean":["무결성=10"],
                  "routedTo":"suggestion:MANUAL_EDIT_HEAVY","note":"감점 아님→보완 금지, 제안으로"} ],
  "conflictsResolved":[ {"field":"종료일","outcome":"극복계약=강점 / 여전히 틀린 계약=보완, 계약 서로소"} ],
  "emptyBuckets":[],
  "audit":{"probes":3,"droppedByEvidenceGate":1,"droppedByMirror":1,
           "selected":{"strength":1,"weakness":1,"suggestion":1}}
}
```

---

## 4. 전처리 (결정적) — v2 1·2단계 계승

라우팅이 먹는 `scoretrack.json`·`turnchunks.json`·`turns.normalized.json`을 만든다. **100% 결정적, LLM 0.**

**4.1 재채점 타임라인 → `scoretrack.json`** (v2 1단계, 실증 PASS)
- 스냅샷마다 **격리 `mktemp -d`**(grade.py:236 `Path("result.json")` CWD 고정 → 연속/병렬 덮어씀 방지).
- tgz에서 `contract_ledger_template.xlsx`·`expiry_targets_template.xlsx`만 추출, **부재 시 빈 템플릿 폴백**(파일부재 EXIT=1 크래시 방지; 빈 제출은 **바닥점 14.0**으로 안전 채점). 폴백은 `degraded=true`.
- **바닥점 14 + 무결성 역설**(빈 제출 무결성=만점) → 절대점수 범위가 14~100으로 압축·비단조 → **절대 곡선 학생 노출 금지, 턴간 Δ만.**
- 멱등 캐시 `sha(ledger)+sha(targets)+graderVersion`.

**4.2 청킹 → `turnchunks.json`** (v2 2단계)
- 연속 스냅샷 쌍마다 **diff = result.json끼리 빼기**(xlsx 셀 diff 엔진 삭제). `오답상세`/`FP·FN샘플`/`유령계약`/`허용외대상유형` 집합 차분 → `_resolved`/`_introduced`. **norm_* 재구현 불필요**(이미 정규화된 값).
- **절대값 아닌 증분 Δ만**. **"최종 정본까지 살아남은 변화만"** moment 후보(비단조 blip 제거).
- **AI작업 귀속은 tool-call 증거(`touchedFiles`) 있을 때만** `aiAction.attributed=true`, 없으면 `aiAction=null`(직접편집 허용, 거짓 flow 금지).
- ⚠️ **per-cell 편집 이력 없음**(교정): result.json diff는 최종상태 집합차분이라 "이 셀을 3번 고쳤다"를 모른다 → `REWRITE_CHURN`/`MANUAL_EDIT_HEAVY`는 **셀 재작성 횟수가 아니라 스냅샷 seq 카덴스 + aiAction=null 비율**로만 검출(신호 없으면 미발화).

**4.3 turns 정본 → `turns.normalized.json`** = chat-log.v1.json user-turn 시퀀스. `totalTurns`·인용·`activeTurns`는 전부 여기서만 채번. 스냅샷↔턴은 봉인시각을 user-turn 타임스탬프 구간에 사영한 `userTurnWindow`(DEBOUNCE로 구간; 어긋나면 보수적으로 넓게). chat-log 정확 스키마 미확정(§10).

---

## 5. 2-tier 검출 + 산출물 내용 read

### 5.1 사각 3종 — 왜 결정적 레시피만으론 부족한가 (grade.py 실측)

| 사각 | grade.py 근거 | result.json이 못 보는 것 | 처방 |
|---|---|---|---|
| **formula vs 하드코딩** | `data_only=True`(94행) → 값만, **수식 셀 캐시 없으면 None→오답** | 종료일을 진짜 계산했나 | 수식 읽기 **비신뢰** → 대화·cellDelta 증거 앵커, 수식은 보너스(교정 C) |
| **정규화 흡수** | `norm_date`/`norm_int`/`norm_yn`이 표기차 흡수 | 학생이 표기를 통일했나 | `FORMAT_NORMALIZE`=점수무관 제안, `FORMAT_MISMATCH`=점수연결 보완(교정 D) |
| **의도 vs 우연** | 값/빈칸 일치만 비교 | 빈칸 존중인가 나태인가 | B-judge가 **윈도우+해당 열 전체**를 보고 판정(EMPTY_RESPECT) |

### 5.2 24유형 A/Hybrid/B 재태깅 (보완=주로A · 강점=혼합 · 제안=주로B)

**강점(8, scoreLinked=true):** `DERIVE_FIELD`(Hybrid, 대화·cellDelta 앵커·수식 보너스)·`EMPTY_RESPECT`(Hybrid, 열 전체 read로 의도 확인)·`FORMAT_NORMALIZE`(**B, 점수무관으로 분리**)·`BOUNDARY_PROBE`(A, F1=1 & 경계 FP·FN 0)·`SPEC_GROUNDING`(Hybrid, 조항 재진술 대화)·`INTEGRITY_CLEAN`(A, 유령·허용외=[])·`INCREMENTAL_CHECK`(B, 샘플 발화·스냅샷 순서)·`SELF_AUDIT`(Hybrid, 후반 Δ>0 & 검증 발화).

**보완(8, scoreLinked=true) — 7개 Pure-A:** `COMPUTE_MISS`(A)·`OVERFILL`(A)·`FORMAT_MISMATCH`(Hybrid, norm 실패 원인 확인)·`BOUNDARY_SKIP`(A)·`RULE_UNDERREAD`(A)·`VERIFY_SKIP`(A)·`OVER_INFER`(A)·`EXTRACTION_ERROR`(A, PDF 원문은 서술용 선택 B). → **틀린 건 result가 확정**하므로 보완은 judge 비용 거의 0.

**제안(8, scoreLinked=false) — 주로 B:** `NO_FINAL_VERIFY`(B)·`PREVIEW_FIRST_ABSENT`(Hybrid)·`REWRITE_CHURN`(A, seq카덴스)·`ONE_SHOT_DUMP`(A, totalTurns≤3)·`MANUAL_EDIT_HEAVY`(A, aiAction=null 비율)·`NO_RULE_RESTATE`(B)·`NO_INTERMEDIATE_SAMPLE`(B)·`LATE_STRUCTURE`(B, 코드파일 부재 시 abstain).

> 각 유형은 §5.4 카탈로그에 닫힌 라벨 + `fireWhen` + `evidenceNeed` + 채점 근거 필드(예 `part1.필드별.종료일`)를 갖는다. 전부 `intention.md` 6함정 + `grade.py` 실재 필드 그라운딩.

### 5.3 judge 입력 패킷 + 출력 계약 (적대적 triple 폐기)

워커가 `evidenceReady=true`인 Hybrid/B 후보에만, 닫힌 **증거 패킷**을 만든다(워커가 추출, judge는 파일 미접근):

```jsonc
// 입력 패킷 (judge가 보는 전부 — 슬라이스 밖 없음)
{ "candidateId":"c1","label":"DERIVE_FIELD","candidateTypes":["DERIVE_FIELD","COMPUTE_MISS"],
  "dialogueWindow":[{"userTurn":14,"text":"종료일 없는 건 시작일에서 계산해줘","ref":"turns#14"}],
  "cellDelta":[{"계약":"CT-2025-028","필드":"종료일","before":"","after":"2026-09-01","정답":"2026-09-01",
                "formula":null,"formulaReadReliable":false,"ref":"after#9.종료일.CT-2025-028"}],
  "columnContext":[/* EMPTY_RESPECT만: 금액열 전체 raw */],
  "resultRefs":["part1.필드별.종료일"],
  "question":"이 슬라이스가 candidateTypes 중 무엇인가. 제공 ref만 인용. 새 사실·숫자 생성 금지." }
```

```jsonc
// 출력 계약 (mock=live=task 공유 — mbti assemble 패턴)
{ "candidateId":"c1","verdict":"DERIVE_FIELD",  // ∈ candidateTypes (밖이면 RuntimeError, mbti band 검증과 동일)
  "present":true,"confidence":"high",            // {high,med,low}→{0.85,0.6,0.35}
  "evidenceCited":["turns#14","after#9.종료일.CT-2025-028"],  // 패킷 ref만
  "rationale":"요청 턴에서 계산 지시, 결과 셀 빈칸→정답 도출",
  "labelDowngradeTo":null }
```

**judge가 절대 못 하는 것:** 점수·Δ·정확도 숫자 생성 / 인용 생성(따옴표는 `dialogueWindow.text` substring만) / `scoreLinked`·점수 변경 / 카탈로그 밖 라벨. **다중 judge는 단일 제약 호출**(저신뢰 후보는 1회 재호출로 일치 확인까지; **적대적 J-pro/J-con triple은 폐기** — 확증편향 패킷 위 악마의 변호인은 반증근거 미접근이라 연극이 됨, 비평 §(1)D). 대신 §3.5 증거 게이트가 선결정하고, EMPTY_RESPECT처럼 의도 판정이 핵심인 유형엔 **열 전체 columnContext**를 패킷에 넣어 judge가 진짜 abstain 가능하게 한다.

### 5.4 산출물 내용 read 빌더 (Hybrid/B만, 워커가 직렬 수행)
- **수식(best-effort):** `data_only=False`로 `cell.value`가 `=…`면 수식. **단 캐시 미존재 케이스가 흔해 비신뢰** → `formulaReadReliable` 플래그, 신뢰 불가면 대화 증거로 폴백.
- **원본 표기:** norm 적용 전 raw 문자열(FORMAT_*).
- **열 전체:** 해당 필드 열 raw(EMPTY_RESPECT 의도).
- **코드파일:** tgz 내 `*.py`·`*.ipynb`(venv·node_modules·PDF 제외 필터·크기상한·PII 마스킹 필수, §10). 부재면 `LATE_STRUCTURE` 등 abstain.

---

## 6. Skill 구현 + 병렬 에이전트

### 6.1 왜 langgraph가 아니라 Claude Code Skill인가
이 flow는 **"점수가 지목한 소수 슬라이스만 깊게 조사"**다 — (a) 슬라이스 격리 판단(타깃 A가 B를 오염 안 함), (b) 결정성 봉쇄(점수·diff·인용은 결정적, 산문만 LLM), (c) agentic 라우팅+종합을 한 세션에. SKILL.md 오케스트레이터가 결정적 모듈을 부르고 판단부만 fan-out한 뒤 종합한다. langgraph는 오케스트레이션 비용만 추가한다.

### 6.2 ★ 두 런타임, 하나의 계약 (비평 C 해소)
overview의 production 경로는 **grading 워커**(repository·MinIO readOnly·`grading.section_results` write)다 — 그 안엔 Claude Code Task가 없다. v3는 이를 **한 계약을 공유하는 두 backend**로 화해한다:

| 런타임 | judge backend | 언제 |
|---|---|---|
| **Claude Code Skill (저작·보정)** | 병렬 investigator **Task** | 골든케이스 보정, n=1 콜드스타트 연구, 소수 건 수동 분석 |
| **production 배치 워커** | **LiteLLM HTTP**(temp0, 제약 JSON — mbti `judge.live` 패턴) | 상시 건당 채점 |
| **CI/회귀** | `mock`(결정적 키워드 휴리스틱) | LLM 없이 end-to-end |

세 backend는 **§5.3 동일 입출력 패킷**을 공유한다(mbti `assemble`의 mock/live 일반화). 워커가 모든 추출(tgz·재채점·패킷 빌드)을 하므로 backend 교체는 "패킷을 어디로 보내 verdict를 받나"의 차이뿐 — judge 일은 작아(닫힌 3지선다 + present bool) **production은 HTTP가 자연 형상**, Task는 저작/보정 형상.

### 6.3 병렬 investigator fan-out 계획 (Skill 경로)

```
SKILL.md 오케스트레이터 (메인 Claude)
 ├─[Bash, LLM0] 4.1 재채점→scoretrack / 4.2 청킹→turnchunks / 4.3 turns 정본
 ├─[Python,LLM0] 3.2~3.4 라우팅→routing_plan / 3.5 증거게이트(needsJudge·droppedByEvidenceGate)
 ├─[Python,LLM0] Tier-A 후보 확정(Pure-A는 judge 불요) + 패킷 빌드(Hybrid/B만)
 ├─▶ 병렬 fan-out (한 메시지에서 Task ×N 동시; 독립이므로 병렬, 동시성 상한 6):
 │     for each candidate where needsJudge:  Task(investigator) ← 그 후보 패킷만(격리, 최소 컨텍스트)
 ├─[Python,LLM0] judge 집계 + §3.6 입장게이트·present화해·mirror·쿼터·선별·일관성 → part_decision
 └─[LLM temp0, 슬롯만] §7 서술 — 인용·diff·점수·턴번호 주입, 산문만, 아이템별 독립
```

| 속성 | 메커니즘 |
|---|---|
| **병렬 단위** | 1 evidenceReady 후보 = 1 investigator. 동일 윈도우·셀군이면 머지(과spawn 방지). 보통 2~4명 |
| **에이전트** | `oh-my-claudecode:scientist`(sonnet, 데이터 판단). 종합만 `analyst`(opus) 1명 |
| **입력** | 그 후보의 §5.3 패킷만(슬라이스 밖 미접근). **MinIO/openpyxl 미사용** — 워커가 이미 추출 |
| **출력** | §5.3 닫힌 verdict. `verdict∉candidateTypes`→폐기. `quote`가 패킷 substring 아니면 자기검증 실패 |
| **동시성·격리** | 상한 6, 초과 시 우선순위순 배치. 후보별 격리 패킷 → 교차오염 0 |
| **멱등·실패격리** | 키 `out/<attemptId>/findings/<candidateId>.json`(존재 시 skip). 한 투자자 죽어도 나머지 진행, 빈 버킷 허용 |
| **결정적 폴백** | `--mock`이면 investigator 대신 키워드 휴리스틱이 candidateTypes에서 verdict 방출 |

### 6.4 SKILL.md 골격 (집 스타일: `name`+긴 `description` 2필드, 얇은 본문)
```yaml
---
name: process-feedback
description: >-
  채점이 끝난 한 응시건(attemptId)의 결과 점수(result.json)와 과정 점수(협업 5축)를 입력으로,
  리포트 섹션 03("나에게 맞는 AI 활용법")의 강점활용/보완필요/추가제안 3버킷 피드백을 생성한다.
  다음이면 거의 항상 이 스킬을 써라: "이 응시자 피드백 만들어줘", "섹션 03 생성", "채점 끝난 건
  코칭 코멘트", "어느 턴이 점수에 영향 줬는지 근거 달아 강점/보완 뽑아줘". 핵심은 이미 산출된
  점수를 *라우팅*해 소수 슬라이스만 병렬로 깊게 조사·종합하는 것이지 채점 자체나 출제가 아니다 —
  채점은 grade.py, 출제는 assignment-factory에 맡겨라.
---
```
본문 7블록(assignment-factory 컨벤션): ①정체성 1줄 ②관통 철학(§0 불변식 7) ③기본값(동시성6·tier3·버킷≤2) ④파이프라인 S1~S6(얇게+`references/` 위임) ⑤산출물 위치 ⑥참조 색인표 ⑦확장지점(타 문제 카탈로그 이식). `model`/`tools` 필드 없음.

```
.claude/skills/process-feedback/
  SKILL.md
  router/ rescore.py turnchunks.py route.py catalog.py evidence_gate.py decide.py gates.py mock_investigator.py
  references/ investigator.md synthesizer.md catalog-24.md checklist.md
  out/<attemptId>/ scoretrack.json turnchunks.json routing_plan.json findings/<id>.json part_decision.json section03.json
```

---

## 7. 피드백 생성·가드 (§5단계 서술 = 유일 LLM 서술 경계)

종합(`analyst` 1명)이 `part_decision.json`을 받아 섹션 03 DTO를 조립한다.
1. **분류 불변식**(LLM 위 덮어씀): `scoreRefs≠null`&만점→강점 / `scoreRefs≠null`&감점→보완 / `scoreRefs=null`→제안.
2. 버킷당 ≤2(우선순위순), 빈 버킷 허용.
3. 각 아이템 4스텝 `[몇번째 대화 → AI작업 → 결과물 diff → 채점영향]` 조립.
4. **산문 슬롯만 생성**(temp0, 아이템별 독립, LiteLLM 내부 서비스 키). **인용·diff·점수·턴번호는 렌더러가 패킷에서 주입** — LLM이 숫자를 안 쓴다.
5. 인과는 "이 셀/대상이 틀려 `셀정확도`/`F1`/무결성이 이만큼"(영문화 금칙).

**게이트(결정적 최종 안전망 — 라우팅·주입이 환각면을 선제 축소하므로 4개로 충분):**

| # | 검사 | 실패 시 |
|---|---|---|
| **G1 인용** | `quote` ⊂ chat-log user-turn(공백정규화) | 드롭 |
| **G2 점수** | 서술 숫자 = 정본 `result.json` `srcRefs` 값(ε) | 드롭 |
| **G3 분류** | `scoreLinked=true⇒scoreRefs≠null` / `false⇒scoreRefs=null` & 점수 미언급 | 재분류/드롭 |
| **G4 무근거 스캐너** | 자유서술서 정규식으로 숫자·"N번째"·"%"·필드명 탐지, 출처 없으면 플래그 | 문장 제거/재생성 |
| **GB1 증거해소** | judge `evidenceCited` 모든 ref 실재(turns substring·cellDelta·pointer) | 미해소 1개라도 후보 드롭 |

> (GB2 "점수 불변"은 폐기 — judge 출력 스키마에 점수 필드가 없어 빈 게이트, 비평 §(1)G.) 라우팅 접점: 점수=result.json 포인터 주입→G2 자동충족, 인용=probe 윈도우 substring→G1 충족, scoreLinked=입장게이트 강제→G3 충족.

---

## 8. 엣지케이스

| 상황 | 근거 | 처리 |
|---|---|---|
| 스냅샷 다턴 묶음(DEBOUNCE 30s) | docs/10 §4·§11 | `userTurnWindow` 구간 귀속, "이 구간에서"로 서술 |
| 방치형 누락(무窓) | 변화 이벤트 없음→청크 없음 | §3.5 게이트가 T2 score-only로(최종 오답상세 제출=`""`만으로 보완) |
| 수식 셀 캐시 부재 | `data_only=True`→None | DERIVE_FIELD는 대화·cellDelta 앵커, 수식 비신뢰, 둘 다 없으면 보수 강등 |
| 부분점수 필드(종료일=0.8) | 집계<1.0 이나 일부 계약 극복 | 극복 계약=강점 / 틀린 계약=보완, **계약 서로소면 공존**(§3.6) |
| 재채점 격리 충돌 | grade.py:236 CWD 고정 | `mktemp -d`, grade.py 수정 불필요 |
| 제출파일 부재 | grade.py EXIT=1 | 빈 템플릿 폴백(`degraded=true`) 또는 인접 스냅샷 귀속 |
| 바닥점 14·무결성 역설 | 실증 1 | 절대 곡선 노출 금지, Δ만, 헤드라인=정본 |
| 샘플 cap 초과(저득점) | 80/20/50 cap | 집계로 랭킹, 윈도우는 샘플 내만 |
| 축 데이터 부재/콜드스타트 | process-axes 미산출·코호트 없음 | Map B delta=0 중립, Map A 단독 |
| AI vs 직접편집 구분불가 | docs/10 §4 | tool-call 있을 때만 귀속, 거짓 flow 금지 |
| 컬럼/키 손상 채점붕괴 | 한글 헤더 dict 키 | "셀정확도·F1 붕괴"로 정확 서술 |

---

## 9. 구현 로드맵

| Phase | 작업 | 산출물 |
|---|---|---|
| **0 계약** | chat-log user-turn/tool-use 스키마, `process-axes.json` 스키마, turn 윈도우 화해, `grading.section_results` | `0NNN_section_results.sql` |
| **1 재채점 척추** | 4.1 격리 CWD+빈템플릿 폴백+grade.py 재실행 | `scoretrack.json` 생성기 |
| **2 청킹** | 4.2 result.json 집합 diff+Δ+AI귀속+최종생존 가드 | `turnchunks.json` 생성기 |
| **3 카탈로그+라우팅** | §3.1 메타 박힌 24유형 + Map A/B + 증거게이트 | `catalog.py`·`route.py`·`evidence_gate.py`·`routing_plan.json` |
| **4 파트결정** | §3.6 입장게이트·present화해·mirror·쿼터·선별·일관성 | `decide.py`·`part_decision.json` |
| **5 judge 3-backend** | mock/HTTP/Task 동일계약 + investigator·synthesizer 프롬프트 | `mock_investigator.py`·`references/*.md` |
| **6 서술·검증** | §7 슬롯 주입 + G1~G4+GB1 + PII 마스킹 | LLM 호출·검증기 |
| **7 렌더·서빙** | DTO + `{success,data,error}` + provenance/audit + 디자인시스템 위젯 | section03 payload |
| **8 QA** | 결정성 회귀(같은 attempt=같은 선별)·환각 주입·빈약/만점/저득점 골든케이스 | 테스트 스위트 |

---

## 10. 리스크 & 미결정 (TODO)

- [ ] **`process-axes.json` 산출 계약** — 섹션 02 5축 생성기가 기계가독 JSON으로 `{score,cohortAvg,delta}`를 내는지, delta가 콜드스타트에 정의되는지 미확정. **확인 전 축 수치 발명 금지**(이 문서의 7.0/−0.6 등은 예시 라벨). 부재 시 Map B 중립 폴백.
- [ ] **chat-log.v1.json 정확 스키마** — user-turn 인덱스·타임스탬프·tool-use(`touchedFiles`) 필드 미확인. 없으면 4.2 AI귀속 약화 → T1↓ T2↑.
- [ ] **수식 read 신뢰도** — `data_only=False`도 캐시·paste-special로 수식 미노출 가능. DERIVE_FIELD는 대화 폴백, 둘 다 없으면 강등(거짓 강점 금지).
- [ ] **part2 per-contract 귀속 한계** — F1은 집합 지표라 계약 단위 점수 분해 불가. weakness 서술은 "이 계약 누락이 F1 하락에 기여"까지만, "N점"은 토픽 총량으로.
- [ ] **judge 비용/지연** — 건당 ≤6 후보 × backend 호출. HTTP backend로 production 단가 억제, evidence 게이트로 호출 수 선제 축소. 배치 동시성·타임아웃·캐시 정책 확정.
- [ ] **tgz 코드파일 파싱** — `*.py`/`*.ipynb` 글롭 필터(venv·node_modules·PDF 제외)·크기상한·PII 마스킹. data_only=False 2차 로더의 merged-cell·적대 워크북 견고성.
- [ ] **turn 윈도우 화해 신뢰도** — 봉인시각↔user-turn 사영. 모델전환·리트라이로 어긋나면 보수적 광역.
- [ ] **유형 카탈로그 일반화** — 24유형은 계약 문제 그라운딩. 타 문제 이식 시 패키지 `eval/`에 카탈로그 동봉(assignment-factory 통합) 미결.
- [ ] **게이밍 내성·코호트 오염** — 점수 직결 피드백 노출의 후속 코호트 신호 영향. `internal_only`·n=1 콜드스타트 명시(mbti §7 정합), 변별력 모니터링.
- [ ] **스냅샷 보존기간** — 섹션03 재생성 윈도우가 `exam-snapshots` lifecycle에 종속.

---

**한 줄 보장:** 점수(결과 8필드·FP/FN·무결성 + 과정 5축)가 "어느 윈도우·셀·카탈로그 유형을 볼지"를 결정적으로 사들이고(`routing_plan`), **fan-out 전 증거-가용성 게이트**가 증거 없는 후보를 가지치며, judge는 좁은 패킷에서 라벨만 고르고(병렬 investigator / HTTP / mock 동일계약), 종합기가 정규화 score_loss로 랭킹해 파트당 ≤2개로 확정한다(`part_decision`). 강점=만점·극복+고점축, 보완=감점필드+저점축, 제안=점수무관 습관(과정-결과 불일치의 출구). 모든 매핑은 실제 `part1.필드별.종료일`·`part2.유령계약`·`score["Part2_무결성(10)"]`·`contract_ledger_template.xlsx`·CT-2024-077 형상에 그라운딩되며, 점수는 끝까지 `result.json`이 소유한다 — judge·축은 라벨·우선순위만 만진다.
