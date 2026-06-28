---
name: assignment-factory
description: >-
  바이브코딩·AI 역량 평가용 "결정성(자동) 채점 과제 패키지"를 (테마 + 대상 직무 + 난이도)에서 반자동 생성·출제한다.
  problem.md(학생용 업무 브리프) + data/(회원·엔티티 + 멀티모달 포스터 + 제출양식) + eval/(README·intention·evaluation·INPUT_GUIDE·생성기·채점기·정답키)
  한 벌을 단일 입력 CSV에서 재현 가능하게 찍어낸다. 다음이면 거의 항상 이 스킬을 써라:
  새 평가 과제·시험 문제를 출제·설계할 때("○○ 직무 과제 만들어줘", "바이브코딩 시험 출제", "신입 AI 역량 평가", "자동 채점되는 과제"),
  타게팅·매칭·세그먼트·대상 선별·분류·대사·집계 같은 과제를 만들 때, 실무 업무(업무형태)를 (자동 채점되는) 학생 평가 과제로 변환·전이할 때,
  youth_policy 같은 기존 과제를 다른 테마·직무로 옮길 때, problems/ 아래에 평가 패키지를 새로 깔(설치할) 때, 채점 가능한(결정적) 과제를 설계할 때.
  핵심은 "과제를 출제(생성)"하는 것이지 그 업무를 직접 수행(데이터 정리·집계·버그픽스·UI)하는 게 아니다 — 후자엔 쓰지 마라.
  학생이 직접 풀이 알고리즘을 발명하지 않고 "주어진 규칙을 적용"하게 만드는 결정성·축↔데이터 교집합·의도된 결함·이중 채점 철학을 그대로 계승한다.
---

# Assignment Factory — 결정성 평가 과제 패키지 생성기

`problems/marketing/1.youth_policy`(청년정책 타게팅) 과제를 만든 **방식·철학·의도**를 전이 가능하게 추출한 스킬이다.
입력 `(테마 + 대상 직무 + 난이도)` → 출력은 동일 철학의 채점 가능한 과제 한 벌(`problem.md` + `data/` + `eval/`).

> 전체 설계 근거: 레포의 [`problems/_과제생성기_skill_설계계획.md`](../../../problems/_과제생성기_skill_설계계획.md),
> [`problems/_5직무-바이브코딩-과제설계.md`](../../../problems/_5직무-바이브코딩-과제설계.md)(채점 5유형·결정성),
> [`problems/_6일반범용-마케팅-산업범용-업무형태-보강.md`](../../../problems/_6일반범용-마케팅-산업범용-업무형태-보강.md)(직무×업무형태 소재 풀).
> 레퍼런스 구현: `problems/marketing/1.youth_policy/`.

## 관통 철학 (모든 생성 과제가 계승 — 절대 타협 금지)

이걸 지키지 못하는 과제는 단계 불문 폐기다(`references/checklist.md`가 발행 게이트).

1. **결정성 1급**: 모든 채점 칸 = (제공 파일 + 명시 규칙) → **유일 정답**. 학생이 기준을 *발명*하게 하지 말고 *제공*한다("발명→적용").
2. **축↔데이터 컬럼 교집합 불변식**: 매칭/판정에 쓰는 모든 축은 회원·엔티티 데이터에 **1:1 대응 컬럼**이 있어야 한다. 축을 추가하면 입력 CSV·생성기·채점기 **세 곳을 동반 수정**한다.
3. **빈칸 = 제약 없음 / 판별 불가 = 추천 안 함**: 명시 안 된 자격은 비운다. 데이터로 확인 불가하면 무리하지 말고 추천하지 않는다(현업의 신중함을 측정).
4. **통제값으로 함정의 결정성 확보**: 실데이터의 통제 불가능한 요소(예: 실제 신청 날짜)는 통제값으로 우회하거나, 못 하면 그 함정을 **버린다**(youth_policy의 '마감 2주 필터' 폐기 전례).
5. **단일 입력 → 재현 가능한 생성**: 같은 입력 CSV + 같은 시드/기준일 = 항상 같은 데이터·정답.
6. **이중 채점 분리**: 과정(채팅 로그 5역량 — 도메인 무관, 이 스킬 범위 밖) + 결과(제출 xlsx — 결정적). 함정을 심어 *검증 안 하면 결과 점수가 떨어지게* 한다.
7. **적대적·독립 검증**: 생성 코드를 재사용하지 않는 독립 재계산 + 적대 리뷰로 자기충족 채점의 허점을 막는다.

## 기본값 (사용자가 안 바꾸면 이대로)

- **아키타입**: 라우터형. 인터뷰에서 아키타입을 판정해 엔진을 고른다. **지원 엔진 5종 자동 생성** — 매칭(`engines/matching/`)·검증/감사/대사(`engines/audit/`)·집계/분석(`engines/aggregate/`)·취합/통합(`engines/merge/`)·분류/라벨링(`engines/classify/`). 그 외(랭킹·퍼널·초안)는 "미지원 + 수동 가이드"를 정직하게 반환한다(`references/archetypes.md`). 초안(생성형)은 유일 정답이 없어 결과 자동 채점 밖이다(형식·과정 채점만).
- **단계 구조**: **분리형(decouple)**. Part1(추출) 실패가 Part2(매칭)로 전이되지 않도록, **Part2에는 정답 정책표를 별도 입력으로 제공**한다. 각 단계가 자기 역량으로만 채점된다.
- **멀티모달**: **운영자 수동 배치**. 실제 포스터/PDF는 코드가 만들지 않는다. 대신 "무엇을 어디서 가져올지" **검색 쿼리·소싱 가이드라인**을 제공한다(`references/multimodal-sourcing.md`).
- **데이터 규모**: **500~1,000명 사이 유동**(채점 속도·변별 균형). 기본 800, 필요 시 조절.
- **학생 수준**: 비개발자. `problem.md`는 쉬운 업무 브리프, 정확한 판정 규칙·칸 형식은 엑셀 '안내' 시트로 이전.

## 파이프라인 (이 순서로 진행 — 상세는 `references/pipeline.md`)

각 단계의 입력/산출/통과 게이트는 `references/pipeline.md`에 표로 있다. 요약:

- **S1 인터뷰** — `references/interview.md`의 Q1~Q11을 묻는다(AskUserQuestion). Q1·Q2·Q6은 필수. Q2/Q4가 매칭이 아니면 즉시 S1.5로.
- **S1.5 아키타입 라우팅** — `references/archetypes.md`. 매칭이면 `engines/matching/`, 검증/감사/대사면 `engines/audit/`, 집계/분석이면 `engines/aggregate/`, 취합/통합이면 `engines/merge/`, 분류/라벨링이면 `engines/classify/`로 계속. 다섯 다 아니면(랭킹·퍼널·초안) "미지원 + 수동 설계 가이드" 반환 후 종료(정직하게).
- **S2 도메인 그라운딩** — 실제 도메인을 웹 리서치로 사실 수집 + 회사색 제거(`_6 §0`). 포스터는 운영자 배치용 **소싱 가이드**만 만든다(`references/multimodal-sourcing.md`).
- **S3 축 설계** — Q6의 축 ↔ 데이터 컬럼 1:1 표를 확정(교집합 불변식). 짝 없는 축은 거부.
- **S4 단일 입력 설계** — `<input>.csv` 헤더 + `INPUT_GUIDE.md` + fail-loud 검증 규칙.
- **S5~S6 생성·결함 주입** — 라우팅된 엔진을 새 스키마로 적응시킨다. **매칭이면 `references/matching-engine-guide.md`**(축 카탈로그·합성 풀·정규화·3군데 동반 수정), **검증/감사면 `references/audit-engine-guide.md`**(cases.csv 시나리오·3소스 결함 주입·rulebook·derive↔expected 한 쌍·Set-F1), **집계/분석이면 `references/aggregate-engine-guide.md`**(spec.csv 시나리오·로그 합성·regroup/summarize 가중집계·분모0/반올림경계 노브·cross_check·4군데 동반 수정), **취합/통합이면 `references/merge-engine-guide.md`**(orders.csv canonical↔소스분배·형식 렌더↔파서 역함수·consolidate↔expected 한 쌍·dedup/우선순위·행집합 F1+셀 Exact), **분류/라벨링이면 `references/classify-engine-guide.md`**(items.csv 시나리오·규칙북(키워드·우선순위)·텍스트 합성 어구·derive_labels↔expected 한 쌍·cross_check·어휘 disjoint·모호함을 규칙으로 결정화·라벨집합 4군데 동반 수정).
- **S7 채점기** — 매칭은 `engines/matching/grade.py`의 `P1_FIELDS`·배점·matchable, 검증은 `engines/audit/grade.py`의 `RECON_FIELDS`·`VIOLATIONS`·`norm_vio`·배점, 집계는 `engines/aggregate/grade.py`의 INT/FLOAT 필드·`FLOAT_TOL`·시트명·배점, 취합은 `engines/merge/grade.py`의 `STD_FIELDS`·`norm_date`/`norm_channel`·배점, 분류는 `engines/classify/grade.py`의 `TYPE_LABELS`/`SENTI_LABELS`·alias dict·`grade_axis`(다클래스 macro-F1+혼동행렬)·축 배선·배점을 새 스키마로 맞춘다.
- **S8 eval 4문서 + S9 problem.md** — `references/doc-templates.md`(README 5구성 / intention / evaluation / INPUT_GUIDE 골격 + 비개발자 problem.md 5규칙).
- **S10 검증(필수)** — `verify/independent_recompute.md`(생성코드 미재사용 재계산 대조) + `verify/adversarial_prompts.md`(Codex/code-reviewer 적대 리뷰) + `references/checklist.md` 발행 게이트. **셋 다 통과 못 하면 발행 금지.**

## 산출물 위치·형태

`problems/<직무>/<번호>.<슬러그>/` 아래에 깐다. 정확한 트리·파일별 책임은 `references/doc-templates.md` 상단 참조. 핵심:
`problem.md` + `data/{<source>/, members.xlsx, <p1>_template.xlsx, <p2>_template.xlsx}` + `eval/{README.md, intention.md, evaluation.md, grade.py, answer_key/{INPUT_GUIDE.md, <input>.csv, build_dataset.py, *_answer.xlsx}}`.

> 채점기 위치 주의: 레퍼런스에서 `grade.py`는 `eval/grade.py`(answer_key 아님)이고 정답키만 `eval/answer_key/`다. 이 배치를 따른다.

## 참조 파일 색인 (필요할 때 읽어라 — 점진적 공개)

| 파일 | 언제 읽나 |
|---|---|
| `references/interview.md` | S1 — 사용자에게 물을 Q1~Q11(선택지·기본값·왜 묻는가) |
| `references/archetypes.md` | S1.5 — 직무×업무형태→아키타입 매핑, 매칭·검증·집계·취합·분류 지원/미지원(랭킹·퍼널·초안) 분기, `_6` 연동 레시피 |
| `references/pipeline.md` | 전 과정 — S1~S10 입력/산출/게이트 표 |
| `references/matching-engine-guide.md` | S5~S7 (매칭) — `engines/matching/`을 새 도메인으로 적응시키는 정확한 변경 지점·절차(AXES) |
| `references/audit-engine-guide.md` | S5~S7 (검증/감사) — `engines/audit/`을 새 대사·감사 테마로 적응(cases.csv 시나리오·결함 주입·rulebook·derive↔expected·Set-F1) |
| `references/aggregate-engine-guide.md` | S5~S7 (집계/분석) — `engines/aggregate/`을 새 집계 테마로 적응(spec.csv 시나리오·로그→regroup/summarize 가중집계·분모0/반올림경계·cross_check·수치 Computed ±ε) |
| `references/merge-engine-guide.md` | S5~S7 (취합/통합) — `engines/merge/`을 새 취합 테마로 적응(orders.csv canonical↔소스분배·형식 렌더↔파서 역함수·consolidate↔expected·dedup/우선순위·행집합 F1+셀 Exact) |
| `references/classify-engine-guide.md` | S5~S7 (분류/라벨링) — `engines/classify/`을 새 분류 테마로 적응(items.csv 시나리오·규칙북(키워드·우선순위)·텍스트 합성 어구·derive_labels↔expected·cross_check·어휘 disjoint·모호함을 규칙으로 결정화·다클래스 macro-F1+혼동행렬) |
| `references/doc-templates.md` | S8~S9 — eval 4문서 골격 + problem.md 5규칙(비개발자) |
| `references/multimodal-sourcing.md` | S2 — 포스터/PDF를 어디서 어떤 쿼리로 가져올지 + 운영자 배치 체크리스트 |
| `references/checklist.md` | S10 — 발행 전 통과 게이트(G1~G10 결정성 + 불변식 + B1~B8 결함 + 이중채점) |
| `engines/matching/` | S5~S7 — 검증된 매칭 엔진(build_dataset.py·grade.py)과 예시 입력(policies.example.csv) |
| `engines/audit/` | S5~S7 — 검증된 검증/감사 엔진(build_dataset.py·grade.py)과 예시 입력(cases.example.csv). 레퍼런스 과제 `problems/general/1.three_way_match` |
| `engines/aggregate/` | S5~S7 — 검증된 집계/분석 엔진(build_dataset.py·grade.py)과 예시 입력(spec.example.csv). 레퍼런스 과제 `problems/marketing/2.email_campaign_metrics` |
| `engines/merge/` | S5~S7 — 검증된 취합/통합 엔진(build_dataset.py·grade.py)과 예시 입력(orders.example.csv). 레퍼런스 과제 `problems/general/2.order_consolidation` |
| `engines/classify/` | S5~S7 — 검증된 분류/라벨링 엔진(build_dataset.py·grade.py)과 예시 입력(items.example.csv). 레퍼런스 과제 `problems/marketing/3.voc_classification` |
| `verify/independent_recompute.md`, `verify/adversarial_prompts.md` | S10 — 독립 재계산·적대 리뷰 방법 |

## 새 아키타입을 추가하려면 (확장 지점)

`engines/<archetype>/`에 같은 **엔진 계약**(단일 입력 CSV → 데이터 + 제출양식 + 정답키 + grade)을 구현하고, `references/archetypes.md`의 라우팅 표에 등록한다. 인터뷰·eval 4문서·결정성 게이트·이중 검증은 전 아키타입이 공유한다. 자세한 계약은 `references/archetypes.md`의 "엔진 계약" 절.
