# Matching Engine — 다축 매칭/타게팅 과제 생성기

`assignment-factory`의 **검증된 첫 엔진**. `problems/marketing/1.youth_policy`(청년정책 타게팅)에서 추출한, **다축 자격 매칭(CRM 타게팅)** 아키타입 전용 데이터셋·정답·채점 도구다. `_6` 카탈로그의 **M8 / MKT-L2-X1·X6 / GEN-L2-X5**(라이프사이클 세그먼트·자격 매칭) 계열을 같은 엔진으로 찍어낸다. 채점유형 = **Set**(집합 F1).

대상 아키타입: (회원/엔티티 × 규칙) 데카르트 곱을 **N개 축의 AND 술어**로 필터해 매칭 집합을 내는 문제. 집계·랭킹·대사·퍼널은 이 엔진 밖이다(`references/archetypes.md`에서 라우터가 "미지원" 분기).

## 구성 파일

| 파일 | 역할 |
|---|---|
| `build_dataset.py` | **단일 입력 CSV → 회원 합성 + 제출양식 + 정답키** 생성기(약 728줄). |
| `grade.py` | **채점기**: Part1 셀 Exact + Part2 집합 F1 + 무결성(약 204줄). |
| `policies.example.csv` | 입력 CSV 예시(youth_policy 9정책). 새 과제는 이걸 베껴 도메인 데이터로 채운다. |

## 어떻게 도는가 (파이프라인)

```
policies.csv (단일 진실 소스)
   │  load_policies()  ── fail-loud 검증(빈 region·허용값·matchable=N 소득모순 즉시 중단)
   ▼
synthesize_members()  ── 정책 axes를 읽어 회원 ~800~1000명 합성
   │   plant_boundaries(p): 각 축(나이·소득·지역·취업·기업규모·무주택·학력·혼인·연소득)에
   │     경계 회원을 자동 삽입(나머지 축은 통과값 고정) → 그 축이 매칭을 실제로 가르게
   ▼
member_passes(m, p)   ── N축 AND 술어로 (회원×정책) 곱을 필터 → 매칭 집합 = 정답
   ▼
엑셀 산출:
   data/members.xlsx                       회원 DB
   data/<p1>_template.xlsx                  Part1 빈 양식 + '안내' 시트
   data/<p2>_template.xlsx                  Part2 빈 양식 + '안내' + 예시행
   eval/answer_key/<p1>_answer.xlsx         Part1 정답
   eval/answer_key/<p2>_answer.xlsx         Part2 정답 (회원ID,정책ID 전부)
```

같은 빈 양식과 정답을 **`p1_row(p, answer=False/True)`** 한 함수로 동시 생성한다(빈양식·정답 드리프트 방지). `policies.csv`만 바꿔 재실행하면 회원 DB·양식·정답이 항상 정합하게 재생성된다.

## 결정성 3종 (반드시 유지 — `references/checklist.md` G10)

1. **고정 기준일** `ASSIGN_DATE = date(2026,6,28)`. `datetime.now()`/`today()` 절대 금지. 만 나이 계산에만 쓰고 날짜 필터로는 안 쓴다(신청 마감은 보지 않음 — 자격만).
2. **고정 시드** `random.seed(20260628)`. 같은 입력 = 같은 회원·정답.
3. **재호출 안전** `synthesize_members()`가 호출마다 전역 `_members.clear()`+`_mid[0]=1`+reseed → 같은 프로세스에서 두 번 불러도 누적/비결정 없음.

## 채점 (grade.py)

- **Part1 (셀 Exact, 50점)** — `P1_FIELDS`(자격 10칸)를 정답키와 셀 단위 대조, 정규화 관용(`norm_int` 빈칸≠0 보존 · `norm_constraint` 무관≡빈칸 · `norm_house` 필요≡Y≡예). 필드별 정확도 분해.
- **Part2 (집합 F1, 40점)** — (회원ID,추천정책ID) 집합의 정밀도/재현율/F1. 순서·중복 무시.
- **무결성 (10점)** — 추천불가 정책 추천·유령 회원ID·판별불가(`matchable=N`) 정책 추천을 FP로 감점. matchable=N은 `policies.csv`에서 직접 읽어 추천 0건을 강제.

## 실행 커맨드

과제 디렉터리(`problems/<직무>/<n>.<slug>/`)에 이 엔진을 `eval/answer_key/build_dataset.py`·`eval/grade.py`로 배치한 뒤(채점기는 `eval/`, 정답키는 `eval/answer_key/`):

```bash
# 1) 생성: policies.csv → 회원DB + 양식 2 + 정답키 2
python eval/answer_key/build_dataset.py
# 콘솔: 정책 N건 / 회원 M명 / 매칭 K건 / 정책별 매칭 수 요약

# 2) 채점: 학생 제출(또는 정답키 자기검증)을 매김
python eval/grade.py \
  --part1 data/policy_table_template.xlsx \
  --part2 data/targeting_template.xlsx \
  --answer-dir eval/answer_key
# 콘솔 표 + result.json (영역별 점수 / FP·FN 목록)
```

`build_dataset.py`는 `data/policies/`(운영자가 넣는 실제 포스터)를 **절대 만들거나 건드리지 않는다** — 멀티모달은 운영자 수동 배치다.

## 새 도메인으로 적응시키려면 → `references/matching-engine-guide.md`

이 엔진을 다른 테마/직무로 옮기는 **정확한 변경 지점·절차**(축 카탈로그·합성 풀·정규화·안내시트를 어디서 동반 수정하는지, AXES 스펙)는 **`references/matching-engine-guide.md`**를 따른다. 핵심 불변식: **축을 추가/변경하면 `policies.csv` 헤더 · `build_dataset.py`(`plant_boundaries`/`member_passes`/`P1COLS`) · `grade.py`(`P1_FIELDS`) 세 곳을 동반 수정**한다(축↔컬럼 교집합 불변식). 적응 후에는 반드시 `verify/independent_recompute.md` + `verify/adversarial_prompts.md` + `references/checklist.md`를 통과해야 발행한다.

## 분리형(decouple) 옵션 — Part2에 정답 정책표 별도 제공

기본 권장은 **분리형**이다. Part1(포스터→정책 자격 추출)의 실패가 Part2(회원 매칭)로 전이되지 않도록, **Part2 입력으로 정답 정책표를 별도 제공**한다(학생이 Part1에서 틀린 정책표 대신 정답 정책표로 매칭만 평가 → 각 단계가 자기 역량으로만 채점). 레퍼런스 youth_policy는 결합/분리 둘 다 가능하게 설계됐다. 결합형(Part1 산출을 Part2 입력으로 전이)으로 가혹도를 올릴 수도 있으며, 어느 쪽이든 `targeting_answer.xlsx` 정답은 동일하다(매칭은 항상 정답 정책표 기준). 인터뷰 Q10에서 선택한다.
