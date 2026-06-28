# Merge Engine — 취합/통합(consolidation) 과제 생성기

`assignment-factory`의 **세 번째 검증된 엔진**. `problems/general/2.order_consolidation`(다채널 주문 통합: 웹·전화·제휴)에서 추출한, **취합/통합** 아키타입 전용 데이터셋·정답·채점 도구다. `_6` 카탈로그의 **취합/통합(정형 다수 양식제각각 → 정형 하나)** 계열을 같은 엔진으로 찍어낸다. 채점유형 = **Set(행)** + **Exact(정규화 셀)**.

대상 아키타입: **정형 다수(양식 제각각) → 정형 하나. "행을 보존하며 합친다".** 같은 엔티티(주문)가 여러 소스에 **양식만 다르게(컬럼명·날짜형식·금액표기) + 중복으로** 등장한다. 표준 스키마 한 표로 **통합·중복제거·정규화**한다. 한 소스 전용 행도 보존한다. 함정 = 중복(여러 소스 동일 주문)·양식차·표기 불일치(공백)·결측·값 충돌(우선순위). 집계·랭킹·퍼널은 이 엔진 밖이다(`references/archetypes.md`).

## 매칭/검증 엔진과의 관계 (무엇을 재사용했나)

- **재사용(그대로)**: 결정성 3종(`ASSIGN_DATE`·`random.seed(20260628)`·전역 누적상태 없음), 경로 스캐폴드(`ROOT=parents[2]`), `int_or_none`, fail-loud 입력 검증(빈 필수값·허용 외 값·키 중복·결측↔값 모순), 엑셀 스타일·`style_header`·freeze, 안내시트 골격(항목/설명 2열 + 빈칸 규칙), `build_consolidated(answer=False/True)` 한 함수로 빈양식·정답 동시 산출, 빈칸≠0 보존 `norm_int`, 차원 분리 배점, 무결성 센티넬.
- **신규(취합 고유)**: canonical 1행을 **여러 소스 스키마/형식으로 렌더**(`build_sources`)하며 양식차·표기변형·결측·**값 충돌(비우선 채널)** 주입, 소스를 **다시 파싱**(`parse_sources`) + **통합 규칙 재적용**(`consolidate`: dedup·우선순위·정렬·정규화)으로 정답 도출, 플래그 의도(`expected_from_canonical`) vs 소스 재구성(`consolidate`)의 **자기검증 cross-check**(fail-loud 핵심).
- **Set 채점 변형**: 검증의 키 (발주번호,품목코드,위반유형) → 취합의 **주문번호 행집합**. Set-F1의 **정밀도 분모 = 제출 데이터 행 전체**(중복 미제거·유령 행이 그대로 FP) + 셀 Exact 별도 집계.

## 단일 산출(취합은 자연 1-part) — 분리형 N/A

검증 엔진은 Part1(대사표 조인)+Part2(위반)로 분리형(decouple)을 쓰지만, **취합은 자연 단일 산출**(통합표 1개)이라 분리형이 적용되지 않는다(`reconcile_table_given.xlsx` 같은 given 양식 없음). `grade.py`는 `--part1`만 받는다.

## 구성 파일

| 파일 | 역할 |
|---|---|
| `build_dataset.py` | **단일 입력 orders.csv → 3소스(웹xlsx/전화csv/제휴xlsx) 합성 + 통합양식 + 통합정답** 생성기. |
| `grade.py` | **채점기**: Part1 통합표 셀 Exact 60 + 행집합 Set-F1 30 + 무결성 10. |
| `orders.example.csv` | 입력 CSV 예시(20주문, 채널조합·표기변형·결측·값충돌 전부 커버). 새 과제는 이걸 베껴 도메인 데이터로 채운다. |

## 어떻게 도는가 (파이프라인)

```
orders.csv (canonical 1행=1주문 — 단일 진실 소스)
   │  load_orders() ── fail-loud(빈 필수값·미지 채널·order_id 중복·
   │                   금액결측↔금액값/주문일결측↔날짜값 모순 즉시 중단)
   ▼
build_sources() ── canonical을 channels에 따라 각 소스 스키마/형식으로 렌더(다채널이면 중복 생성)
   │   웹: 금액 천단위콤마 "1,200,000" · 주문일시 "YYYY-MM-DD HH:MM"
   │   전화: amount 정수 · date "YYYY/MM/DD"
   │   제휴: 결제액 정수 · 일자 "MM/DD/YYYY"
   │   표기변형=상품명공백/고객명공백 → 앞뒤 공백 주입(trim 함정)
   │   결측=금액결측/주문일결측 → 전 채널 빈값(빈칸 보존 함정)
   │   값충돌 → 비우선 채널의 한 필드를 다르게(우선순위 web>partner>phone 함정)
   ▼
parse_sources() ── 3소스 셀을 다시 파싱·정규화(날짜 3형식→YYYY-MM-DD, 금액 콤마제거→정수, trim)
   ▼
consolidate() ── 주문번호로 dedup → 1행. 값=우선순위 채널, 출처채널=등장채널 정렬·파이프결합
   ▼
cross_check(consolidate == expected_from_canonical) ── 자기검증 (불일치=생성기 버그 → 중단)
   ▼
산출:
   data/웹주문.xlsx · 전화주문.csv · 제휴주문.xlsx          3소스(학생 입력, 양식 제각각)
   data/consolidated_template.xlsx                          제출 빈 양식 + '안내'(+예시행)
   eval/answer_key/consolidated_answer.xlsx                 통합 정답표(표준 7칸)
```

## 통합 규칙 (rulebook — 안내시트에 명시)

| 항목 | 규칙 |
|---|---|
| dedup | 같은 주문번호가 여러 채널 → 1행. 여러 줄로 두면 감점. |
| 출처채널 | 등장 채널을 알파벳 정렬·파이프결합. 예) web+partner → `partner\|web`. |
| 값 충돌 우선순위 | 채널마다 값이 다르면 `web > partner > phone` 채널 값을 택한다. |
| 날짜 정규화 | 3형식(HH:MM 포함 ISO / YYYY/MM/DD / MM/DD/YYYY) → `YYYY-MM-DD`. |
| 금액 정규화 | 천단위 콤마 제거 → 정수. |
| 공백 정규화 | 고객명·상품명 앞뒤 공백 trim. |
| 빈칸 보존 | 원본 결측 칸은 비운다. 0과 빈칸은 다르다. |
| 보존 | 한 채널 전용 주문도 빠짐없이 포함. |

표준 스키마(7칸): 주문번호 · 고객명 · 상품명 · 수량 · 금액_원(정수) · 주문일(YYYY-MM-DD) · 출처채널.

## 결정성 3종 (반드시 유지 — `references/checklist.md` G10)

1. **고정 기준일** `ASSIGN_DATE = date(2026,6,28)`. `datetime.now()`/`today()` 금지.
2. **고정 시드** `random.seed(20260628)`(웹 주문일시 시각·값충돌 오프셋·공백 패턴). 같은 orders.csv = 같은 3소스·정답(셀 값 동일; xlsx 바이트는 zip 타임스탬프만 다름).
3. **단일 입력 재현** orders.csv만 바꿔 재실행하면 3소스·양식·정답이 항상 정합 재생성. 전역 누적 상태 없음(모든 합성이 `build_sources`의 지역 리스트).

## 채점 (grade.py) — Set(행) + Exact(정규화 셀)

- **Part1 셀 Exact (60점)** — 정답 주문번호마다 6칸(고객명·상품명·수량·금액_원·주문일·출처채널)을 정규화 후 셀 단위 대조. `norm_int`(빈칸≠0)·`norm_date`(형식통일)·`norm_str`(공백제거)·`norm_channel`(토큰 정렬→순서무관).
- **Part1 행집합 Set-F1 (30점)** — 주문번호 행집합. **정밀도 분모 = 제출 데이터 행 전체** → 중복 미제거·유령 행이 그대로 FP(extra=중복미제거/유령). 재현율 = 정답 키 기준(missing=누락).
- **무결성 (10점)** — 유령 주문번호(미존재 키) + 중복 미제거(같은 주문번호 다중 행)를 건당 0.5점 감점.

`norm_*`는 동치 표기를 흡수(G9 과민채점 금지) — 콤마/날짜형식/공백/채널순서는 관용. 잘못된 값(우선순위 오선택·날짜 오해석·dedup 실패)은 셀·행집합·무결성으로 자연 처벌.

## 실행 커맨드

과제 디렉터리(`problems/<직무>/<n>.<slug>/`)에 `eval/answer_key/build_dataset.py`·`eval/grade.py`로 배치한 뒤:

```bash
# 1) 생성: orders.csv → 3소스 + 양식 + 정답키
python eval/answer_key/build_dataset.py
# 콘솔: canonical N건 / 3소스 행수 / 통합행 / 단일·다채널 / 값충돌 / 빈칸 수

# 2) 자기채점(정답키 자기검증 — 100점 기대)
python eval/grade.py \
  --part1 eval/answer_key/consolidated_answer.xlsx \
  --answer-dir eval/answer_key
```

## 새 취합 도메인으로 적응 (도메인 중립화 지점)

소스/엔티티 명칭은 과제마다 orders.csv 헤더·`WEB_COLS`/`PHONE_COLS`/`PARTNER_COLS`·렌더 포맷터로 바뀐다. **취합 아키타입의 제너릭 골격**: `build_sources`(canonical→소스 렌더·결함 주입)·`parse_sources`(소스→정규화 레코드)·`consolidate`(dedup·우선순위·정렬)·`cross_check`(재구성==의도)·`STD_FIELDS`(채점 칸↔정규화). 새 도메인(예: 다지점 재고대장 통합, 다기관 회원명부 통합)은 (a) orders.csv 결함 노브 열, (b) 소스 헤더·포맷터, (c) `STD_COLS`/`STD_FIELDS`·우선순위·정규화 규칙을 동반 수정한다. **불변식**: `consolidate`(소스 재구성)와 `expected_from_canonical`(플래그 의도)가 항상 일치(`cross_check` 강제)하며, 정답은 **반드시 생성된 소스에서 재구성**(orders.csv 직접 베끼기 금지)한다 — 이것이 독립 검증·결정성의 근거다.
