# 평가 방식 (evaluation)

> 제출물 2개를 **정답키와 자동 대조**한다. 채점 스크립트는 [`grade.py`](grade.py), 정답키는 [`answer_key/`](answer_key/).
> 결과(문제 해결) 점수만 다룬다. 과정(AI 협업) 점수는 채팅 로그 기반 별도 루브릭.

---

## 1. 제출물 스키마 (정답이 결정되는 형식)

### Part 1 — `campaign_table_template.xlsx` · 시트 `캠페인정리`
행 단위 = **캠페인 1건** (`campaigns.csv`에 정의된 모든 캠페인, `campaign_id` = `C01`…). 정답은 모두 `campaigns.csv` 값에서 나온다. 컬럼 순서: `캠페인ID,캠페인명,채널,거주지요건,연령_min,연령_max,휴면일수_min,휴면일수_max,누적구매액하한_원,회원등급요건,선호채널요건,수신동의요건,앱설치요건`.

| 컬럼 | 형식 / 허용값 | 채점유형 |
|---|---|---|
| `캠페인ID` | `C01`… (키, `campaign_id`) | — |
| `캠페인명` | 문자열(`name`) — **양식에 미리 주어짐(채점 안 함)** | — |
| `채널` | `이메일`\|`앱푸시`\|`SMS`\|`오프라인` (`channel`) — **양식에 미리 주어짐(채점 안 함)** | — |
| `거주지요건` | 캠페인 `region` 그대로: `전국` \| 시도(`서울특별시`…) \| `시도 자치구`(`서울특별시 관악구`…) | Exact |
| `연령_min` | 정수(만 나이, `age_min`). 하한 없으면 **빈칸** | Exact |
| `연령_max` | 정수(만 나이, `age_max`). 상한 없으면 **빈칸** | Exact |
| `휴면일수_min` | 정수(일, `dormant_days_min`). '휴면 N일 이상'. 없으면 **빈칸** | Exact |
| `휴면일수_max` | 정수(일, `dormant_days_max`). '최근 N일 이내'. 없으면 **빈칸** | Exact |
| `누적구매액하한_원` | 정수(원, `total_spend_min`). 하한 없으면 **빈칸**(0과 빈칸은 다름) | Exact |
| `회원등급요건` | `일반`\|`실버`\|`골드`\|`VIP` (`member_grade`). 무관이면 **빈칸** | Exact |
| `선호채널요건` | `이메일`\|`앱푸시`\|`SMS` (`pref_channel`). 무관이면 **빈칸** | Exact |
| `수신동의요건` | `필요`(`opt_in_required=Y`) 또는 **빈칸** | Exact |
| `앱설치요건` | `필요`(`app_installed_required=Y`) 또는 **빈칸** | Exact |

> 캠페인명·채널은 제출 양식에 **미리 채워져 제공**된다(채점 대상 아님). 학생은 대상 조건 10칸(거주·연령min·max·휴면min·max·누적하한·등급·선호채널·수신동의·앱설치)만 추출한다. 브리프에 명시 안 된 조건 칸은 **빈칸이 정답**이다(제약 없음). **고객 명단으로 확인 불가한 캠페인(`matchable=N`, 예: C07)의 조건 칸도 빈칸이 정답** — 억지로 값을 채우면 Exact 비교에서 오답이다. `matchable`은 캠페인표에 노출하지 않는다(운영 전용). 채점은 `무관`≡빈칸, 수신동의/앱설치 `필요`≡`Y`/`예`/`O`/`필수`로 정규화한다(`norm_constraint`/`norm_req`).

### Part 2 — `targeting_template.xlsx` · 시트 `타게팅`
행 단위 = **(고객 × 추천캠페인) 1조합**. 대상 조건(나이·거주·휴면일수·누적구매액·등급·채널·동의·앱설치)을 모두 통과한 조합만 기록. 어떤 캠페인에도 안 맞는 고객은 적지 않는다. **`matchable=N` 캠페인은 어떤 고객도 통과시키지 않으므로 추천 0건이 정답**이다. Part2 입력은 **분리형 제공표 `campaign_table_given.xlsx`**(Part1 결과 아님).

| 컬럼 | 형식 | 채점유형 |
|---|---|---|
| `고객ID` | `customers.xlsx`의 식별자 (`U0001`…) | Set |
| `추천캠페인ID` | `campaigns.csv`의 `campaign_id`(`C01`…) 중 **`matchable != N` 캠페인만** | Set |

> 채점은 **(고객ID, 추천캠페인ID) 튜플의 집합**으로 한다. **행 순서 무관**, 중복 행은 1개로 간주. 제출 양식의 `예시U0001` 같은 예시 행은 무시한다.

---

## 2. 채점 로직 (`grade.py` 구성요소)

```
grade.py
├─ load_sheet(path, sheet)            # openpyxl 로드 → 정규화(공백 strip, 숫자 캐스팅, 빈행 스킵)
├─ grade_part1(sub, ans)             # 캠페인정리표: 셀 단위 비교
│   • 키(캠페인ID)로 행 조인
│   • P1_FIELDS = 거주지요건·연령_min·연령_max·휴면일수_min·휴면일수_max·
│     누적구매액하한_원(norm_int)·회원등급요건·선호채널요건(norm_constraint)·
│     수신동의요건·앱설치요건(norm_req)
│   • 필드별 일치 집계 → 필드별 정확도 + 전체 셀 정확도 + 오답상세
├─ grade_part2(sub, ans, valid_policies, valid_members)   # 타게팅: 집합 비교
│   • {(고객ID, 캠페인ID)} 집합화 (예시행 제외)
│   • precision / recall / F1
│   • 오발송(FP)·누락(FN) 분리 집계
│   • 무결성: bad_policy(유효 캠페인 밖)·ghost_id(유령 고객)·
│     unmatchable(matchable=N 등 정답매칭 0인 캠페인 추천) 탐지
└─ score(p1, p2) + main()            # 부분점수 차원 분리 출력(콘솔 표 + result.json)
```

### 정규화 규칙(채점 관용)
- `norm_str`: 모든 공백 제거 후 비교. `서울특별시 관악구`/`서울특별시  관악구` 동일.
- `norm_int`(연령·휴면일수·누적구매액하한): 천단위 콤마·공백 제거 후 정수 비교. **빈칸=제약없음, `0`=하한 0원으로 구분**(`3,600,000`/`3600000` 동일).
- `norm_constraint`(회원등급요건·선호채널요건): `무관`/`없음`/`제한없음`/`해당없음`/빈칸 → 동일(`제약없음`)으로 본다.
- `norm_req`(수신동의요건·앱설치요건): `필요`/`Y`/`예`/`O`/`필수`/`TRUE` → `필요`. 그 외는 빈칸.
- 빈 집합(정답·제출 모두 0건)의 F1=1로 처리.

---

## 3. 배점 (결과 점수 100점 기준)

| 영역 | 배점 | 산정 |
|---|--:|---|
| Part 1 조건 추출 정확도 | 50 | (정확 셀 / 전체 채점 셀) × 50 |
| Part 2 타게팅 F1 | 40 | F1 × 40 |
| Part 2 무결성(오발송·유령ID·`matchable=N` 추천) | 10 | `max(0, 10 − 오발송_FP수 × 0.5)` |

> 현재 구성: 캠페인 7건 × 채점 필드 10칸 = **전체 채점 셀 70개**. **합격선(1단계 능력)**: Part 1을 채워 대량을 일관 처리. **변별(2단계)**: 만 나이·휴면일수(89/90/91)·누적구매액 하한·주소 정규화를 모두 통과해 Part 2 F1을 끌어올림.

### 흔한 실패 = 의도한 함정 적중
- 만 나이를 출생연도 뺄셈으로 계산 → 7~12월생 경계 회원 **오분류**.
- 휴면일수를 일수로 변환 않고 날짜 문자열 비교 → `C01`(≥90)/`C03`(≤14) 경계에서 **FP/FN**.
- 누적구매액을 상한(`<=`)으로 착각(청년정책 소득과 헷갈림) → `C02`(≥100만) 매칭이 **정반대로 틀어짐**.
- 주소를 문자열 그대로 비교 → 시도/자치구 매칭 실패 → **FN 급증**.
- 빈 조건 칸에 임의 기본값 주입(전 캠페인 수신동의 요구 등) → 매칭이 틀어짐, Part 1 셀 오답.
- 판별 불가 캠페인(`matchable=N`, C07)을 조건이 맞아 보인다는 이유로 추천 → Part 2 **FP**(오발송), 정책표에 억지 값 → Part 1 **셀 오답**.

---

## 4. 정답키 생성·관리

- 정답키(`answer_key/campaign_table_answer.xlsx`, `answer_key/targeting_answer.xlsx`)와 제공 데이터(`../data/`)는 **단일 입력 [`answer_key/campaigns.csv`](answer_key/campaigns.csv)** 에서 같은 스크립트로 나온다 → 캠페인·고객DB·정답이 항상 정합. (브리프 파일은 운영자가 `data/briefs/`에 직접 넣는다 — 코드 생성 아님)
- 분리형 Part2 입력 `data/campaign_table_given.xlsx`(matchable!=N 캠페인만, 올바른 조건)도 같은 생성기가 만든다.
- 캠페인을 바꾸려면 **`campaigns.csv`만 수정**하고 생성 스크립트를 다시 돌려 **데이터와 정답키를 동시 갱신**한다(생성물 수기 편집 금지). CSV 작성법은 [`answer_key/INPUT_GUIDE.md`](answer_key/INPUT_GUIDE.md).
- 생성기: [`answer_key/build_dataset.py`](answer_key/build_dataset.py) — `campaigns.csv` 읽기 → 고객 합성(경계 회원 자동 삽입) + 제출양식 + 분리형 입력 + 정답키 + 매칭 정답을 일괄 산출. 매칭 대상 = `matchable != N` 인 모든 캠페인. 기준일 `ASSIGN_DATE = 2026-06-28` 상수 고정(`datetime.now()` 미사용) — **만 나이·휴면일수 계산에만** 쓴다. `random.seed(20260628)`로 고정(`synthesize_members`가 재호출 시 clear+reseed).

## 5. 채점 실행

```bash
# 학생 제출물 채점
python eval/grade.py \
  --part1 data/campaign_table_template.xlsx \
  --part2 data/targeting_template.xlsx \
  --answer-dir eval/answer_key
# → 콘솔 표 + result.json (영역별 점수·FP/FN 목록)
```
