# Audit Engine — 검증/감사(대사) 과제 생성기

`assignment-factory`의 **두 번째 검증된 엔진**. `problems/general/1.three_way_match`(3종 대사: 발주서·입고증·세금계산서)에서 추출한, **검증/감사** 아키타입 전용 데이터셋·정답·채점 도구다. `_6` 카탈로그의 **G1 / GEN-L2-X1·X2**(두 대장 대사·다장부 대사) 계열을 같은 엔진으로 찍어낸다. 채점유형 = **Set-F1**(위반 집합) + **셀 Exact**(대사표).

대상 아키타입: **데이터 + 규칙 → 위반 판정**. "정답이 곧 규칙". 여러 소스(장부)에 **불일치·누락을 주입**하고, **허용오차 규칙을 다시 적용**해 위반을 도출한다. 정상(위반 없음)은 예외에 올리지 않는다(올리면 FP). 집계·랭킹·퍼널은 이 엔진 밖이다(`references/archetypes.md`).

## 매칭 엔진과의 관계 (무엇을 재사용했나)

- **재사용(그대로)**: 결정성 3종(`ASSIGN_DATE`·`random.seed`·필요 시 clear+reseed), 경로 스캐폴드(`ROOT=parents[2]`), `int_or_none`, 엑셀 스타일·`style_header`·freeze, 안내시트 골격(항목/설명 2열 + 빈칸 규칙), **Set-F1 채점**(`grade_part2`의 정밀도/재현율/F1 + 빈집합=완벽 처리), 빈칸≠0 보존 `norm_int`, 차원 분리 배점, 무결성 센티넬(유령 키/허용 외 값), `p1_row(answer=False/True)` 한 함수로 빈양식·정답 동시 산출.
- **신규(검증 고유)**: 단일 키 매칭이 아니라 **여러 소스에 결함을 주입**하는 데이터 생성기(`build_tables`), **허용오차 규칙 재적용 정답 도출**(`derive_violations`), 플래그 의도 vs 규칙 도출의 **자기검증 cross-check**(fail-loud 핵심), 분리형 정답 대사표(`reconcile_table_given.xlsx`).
- **Set-F1 변형**: 매칭의 채점 키 **(회원, 정책)** → 검증의 **(발주번호, 품목코드, 위반유형)** 로 치환. 같은 `grade_part2` 메커니즘(집합 교집합 → P/R/F1)을 키만 바꿔 그대로 씀.

## 구성 파일

| 파일 | 역할 |
|---|---|
| `build_dataset.py` | **단일 입력 cases.csv → 3장부 합성 + 제출양식 + 정답키** 생성기. |
| `grade.py` | **채점기**: Part1 대사표 셀 Exact + Part2 예외 Set-F1 + 무결성. |
| `cases.example.csv` | 입력 CSV 예시(20거래, 위반유형·경계 전부 커버). 새 과제는 이걸 베껴 도메인 데이터로 채운다. |

## 어떻게 도는가 (파이프라인)

```
cases.csv (단일 진실 소스 — 시나리오 명세)
   │  load_cases()  ── fail-loud(빈 필수값·허용 외 Y/N·거래키 중복·
   │                   입고누락+수량차/계산서누락+단가차/양쪽누락+표기변형 모순 즉시 중단)
   ▼
build_tables()  ── 플래그로 3장부에 불일치·누락 주입
   │   입고수량 = 발주수량 + 입고수량차 (입고누락=Y → 행 제외)
   │   청구단가 = 발주단가 + 청구단가차, 청구금액 = 청구수량×청구단가 (±오차 주입; 계산서누락=Y → 행 제외)
   │   품목명표기변형=Y → 품목명만 다르게(조인은 품목코드 → 비위반 FP 함정)
   ▼
cross_check()  ── 규칙도출(derive) == 플래그의도(expected) 자기검증 (불일치=생성기 버그 → 중단)
   ▼
derive_violations(txn)  ── 3장부에 허용오차 규칙 **재적용** → 위반 집합 = 정답 (플래그 직접 안 읽음)
   ▼
엑셀 산출:
   data/발주_table.xlsx · 입고_table.xlsx · 계산서_table.xlsx   3장부(학생 입력)
   data/reconcile_table_template.xlsx                           Part1 빈 양식 + '안내'
   data/exception_template.xlsx                                 Part2 빈 양식 + '안내' + 예시행
   data/reconcile_table_given.xlsx                              ★분리형: Part2 입력용 정답 대사표
   eval/answer_key/reconcile_table_answer.xlsx                  Part1 정답(대사정리표)
   eval/answer_key/exception_answer.xlsx                        Part2 정답(예외목록 — 위반 전부)
```

## 허용오차 규칙 (rulebook — 안내시트에 명시, 도메인 중립 상수)

| 축 | 규칙 | 경계 |
|---|---|---|
| 수량 | 발주수량 = 입고수량 = 청구수량 정확 일치(`QTY_TOL=0`) | 차이 1부터 위반 |
| 단가 | \|청구단가 − 발주단가\| ≤ `PRICE_TOL`(10) | 10=정상, 11=위반 |
| 금액 | \|청구금액 − 청구수량×청구단가\| ≤ `AMOUNT_TOL`(1) | 1=정상, 2=위반 |
| 누락 | 입고 행 없음 → 입고누락 / 계산서 행 없음 → 계산서누락 | — |

한 거래가 **복수 위반** 가능(예: 수량불일치+단가불일치 → 예외 행 2개). 위반유형 ∈ {수량불일치, 단가불일치, 금액오류, 입고누락, 계산서누락}.

## 결정성 3종 (반드시 유지 — `references/checklist.md` G10)

1. **고정 기준일** `ASSIGN_DATE = date(2026,6,28)`(장부일자 합성용, 채점 미사용). `datetime.now()`/`today()` 금지.
2. **고정 시드** `random.seed(20260628)`. 같은 cases.csv = 같은 3장부·정답.
3. **단일 입력 재현** cases.csv만 바꿔 재실행하면 3장부·양식·정답이 항상 정합 재생성. (전역 누적 상태 없음 — 모든 합성이 `build_tables`의 지역 리스트.)

## 채점 (grade.py)

- **Part1 대사정리표 (셀 Exact, 40점)** — `RECON_FIELDS`(발주수량/발주단가/입고수량/청구수량/청구단가/청구금액 6칸)를 거래 키(발주번호+품목코드)로 정답과 셀 단위 대조. `norm_int` 빈칸≠0 보존(누락 빈칸 vs 입고수량 0 구분).
- **Part2 예외목록 (Set-F1, 50점)** — (발주번호, 품목코드, 위반유형) 집합의 정밀도/재현율/F1. 순서·중복 무시. 빈 제출·정상 오등록은 F1로 자연 처벌. `norm_vio`가 위반유형 동치 표기 흡수.
- **무결성 (10점)** — 유령 거래(미존재 키)·허용 외 위반유형을 FP로 감점.

## 분리형(decouple)

Part2는 학생이 Part1에서 직접 만든 대사표가 아니라 **`data/reconcile_table_given.xlsx`(제공된 정답 대사표)**를 입력으로 쓴다 → 1단계 조인 실패가 2단계로 전이되지 않는다. `reconcile_table_given.xlsx` = Part1 정답과 동일 내용(`build_reconcile(..., answer=True)` 재사용).

## 실행 커맨드

과제 디렉터리(`problems/<직무>/<n>.<slug>/`)에 `eval/answer_key/build_dataset.py`·`eval/grade.py`로 배치한 뒤:

```bash
# 1) 생성: cases.csv → 3장부 + 양식 + 정답키
python eval/answer_key/build_dataset.py
# 콘솔: 거래 N건 / 3장부 행수 / 위반유형별 건수 / 정상 거래 수

# 2) 자기채점(정답키 자기검증 — 100점 기대)
python eval/grade.py \
  --part1 eval/answer_key/reconcile_table_answer.xlsx \
  --part2 eval/answer_key/exception_answer.xlsx \
  --answer-dir eval/answer_key
```

## 새 검증 도메인으로 적응 (도메인 중립화 지점)

품목/장부 명칭은 과제마다 cases.csv·`PO_COLS`/`GR_COLS`/`INV_COLS` 헤더로 바뀐다. 규칙 상수(`QTY_TOL`/`PRICE_TOL`/`AMOUNT_TOL`)·위반유형 라벨(`VIOLATIONS`)·도출 로직(`derive_violations`)·자기검증(`expected_from_flags`)이 **검증 아키타입의 제너릭 골격**이다. 새 도메인(예: 출퇴근 기록 vs 급여대장 vs 근로계약)은 (a) cases.csv 결함 플래그 열, (b) 세 헤더, (c) 세 규칙 상수와 `derive_violations`/`expected_from_flags` 블록 **한 쌍**을 동반 수정한다. **불변식**: `derive_violations`(테이블→위반)와 `expected_from_flags`(플래그→의도)가 항상 일치해야 하며(`cross_check` 강제), 정답은 **반드시 테이블에서 규칙 재적용으로 도출**(플래그 직접 읽기 금지)한다 — 이것이 독립 검증·결정성의 근거다.
