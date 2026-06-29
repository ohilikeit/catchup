# 매칭 엔진 적응 가이드 (S5~S7) — `engines/matching/`을 새 도메인/축으로 바꾸기

**목적**: 검증된 매칭 엔진(`engines/matching/build_dataset.py` 728줄 · `grade.py` 204줄)을 새 테마·새 판정 축으로 **정확히 어디를 바꿔야 하는지** 단계별로 짚는다. 이 엔진은 **G(제너릭 골격) / S(도메인 내용)가 이미 함수 경계로 분리**돼 있어, 바꿀 곳은 좁고 명확하다.

> 근거: 설계계획 §6.1(GENERIC vs DOMAIN-SPECIFIC 표)·§6.2(입력 노브). 레퍼런스 입력: `engines/matching/policies.example.csv`(youth_policy 9축 실데이터). 줄 번호는 `build_dataset.py`/`grade.py` 기준.
>
> **불변 철학**(SKILL.md "관통 철학"): 결정성 1급 · 축↔컬럼 교집합 불변식 · 빈칸=무관/판별불가=추천안함 · 단일 입력 재현. 적응 중 이 중 하나라도 깨지면 그 변경은 폐기한다.

---

## 0. 큰 그림 — 한 과제는 코드의 어디까지 건드리나

| 무엇 | 어디 | 바꾸나? |
|---|---|---|
| 경로·결정성·파서·지역 알고리즘·만나이·안내시트 골격·엑셀 스타일·main 흐름·grade 거의 전부 | §1 GENERIC | **그대로 둔다** |
| 정책 CSV 스키마·회원 컬럼·합성 풀·축별 통과/경계 생성기·축별 AND 조건·출력 칸·안내 텍스트·grade의 `P1_FIELDS`/배점 | §2 DOMAIN-SPECIFIC | **과제마다 바꾼다** |

작업 순서: **§2 체크리스트 ①~⑧을 위에서 아래로** 바꾼 뒤, §3 불변식으로 누락을 점검하고, §4(분리형) 적용, §5 재생성·자기채점·독립검증 루프로 닫는다.

---

## 1. 그대로 두는 GENERIC (건드리지 말 것)

아래는 도메인이 바뀌어도 **메커니즘이 동일**하다. 값(상수)만 §2에서 갈아끼우고, 함수 몸통은 보존한다.

- **경로 스캐폴드** — `ROOT/DATA/ANS` + `mkdir`(L45–51). `ROOT = parents[2]`라 과제 폴더 위치가 바뀌어도 동작. **데이터 폴더(`data/<source>/`)는 절대 만들거나 지우지 않는다**(운영자 포스터 보호, L49 주석).
- **결정성 3종** — ① `ASSIGN_DATE`(L56, 만나이용 기준일 상수, `datetime.now()` 금지) ② `random.seed(20260628)`(L57) ③ `synthesize_members`의 **clear + reseed**(L478–480: `_members.clear()` / `_mid[0]=1` / `random.seed(...)`). **재호출 안전성**의 핵심 — 값(날짜·시드)만 §2⑦에서 바꾸고 패턴은 보존.
- **`int_or_none`**(L90–97) — 빈칸→None, 콤마·공백 제거 정수 파서. 모든 수치 축에 재사용.
- **지역 정규화·멤버십**(L103–166) — `NONSEOUL_SIDO`·`detect_sido`·`detect_gu`·`parse_policy_region`·`region_match`. **알고리즘은 그대로**, 지역 사전(`SIDO_GU`/`SEOUL25`)만 §2⑧에서 교체. 비서울 시도를 서울 자치구 substring보다 먼저 검사하는 우선순위(L117)는 버그 방지 장치이니 유지.
- **만나이·경계 생성기**(L227–251) — `manage`(만나이, 생일 안 지나면 -1)·`birth_for_age`(1~5월=경과)·`birth_unpassed`(7~12월=미경과, 만나이 함정의 원형)·`birth_random`(1~12월 혼재). **연령 매칭/경계 트랩의 제너릭 원형**이라 그대로 재사용.
- **`add_member` 골격**(L358–391) — 레코드 빌더 + 자동 ID(`M{n:04d}`). **컬럼 dict(L372–390)만** §2②에서 새 스키마로 교체하고, ID 자동발급·`_members`/`_mid` 누적 패턴은 보존.
- **`plant_boundaries` *패턴*** (L395–473) — "각 축에 경계 엔티티를 심고 나머지 축은 통과값 고정"이라는 메타-패턴은 G. **블록 (A~I)의 축 목록·경계 로직은 S**(§2④).
- **안내시트 골격**(L597–636 build_p1 / L639–686 build_p2) — '안내' 시트(항목/설명 2열) + '정책정리'/'타게팅' 데이터 시트 + 스타일·freeze·열너비. **골격은 G**, 안내 텍스트(`guide=[...]`)는 S(§2⑥).
- **`load_policies` 골격**(L172–221) — `DictReader`(utf-8-sig) + fail-loud 검증 루프 + 행 dict 빌드. **루프 구조·fail-loud 메커니즘은 G**, 필드 스키마·허용값(L189–198)은 S(§2①).
- **엑셀 스타일·`write_members`·`style_header`**(L546–574) — `HDR`/`HDRFILL`/`GUIDE` 스타일, 헤더 채색, freeze. 그대로.
- **`main` 파이프라인**(L692–723) — 로드→합성→매칭 정답 계산(L700–705)→엑셀 5개 출력→요약 print. **흐름은 G**(파일명 인자만 따라옴).
  > 📛 **학생 노출 네이밍**(`doc-templates.md §0.1`): 이 엔진이 찍는 학생 파일·폴더명은 한국어 역할명으로 둔다(`data/`→`데이터/`, `members.xlsx`→`회원명단.xlsx`, `*_template.xlsx`→`*_제출용.xlsx`, 분리형 정답표 `*_given.xlsx`→`*_참고용.xlsx`). 운영자 배치 포스터 폴더(`data/<source>/`)도 `데이터/<소스>/`. 안내시트 텍스트·problem.md도 쉬운 말(축·F1·matchable 등 전문어 금지 — 판정 의미·유일 정답은 보존, 실데이터 컬럼명은 예외). 파일명을 정하면 그 이름을 build 출력·docstring·안내시트·README/INPUT_GUIDE/evaluation·grade 사용예시까지 동기화하고, 재생성→자기채점 100점으로 확인.
- **`grade.py` 거의 전부** — `norm_str/date/int/bool`(L19–43)·`load_sheet`(L57)·`grade_part1` 셀 Exact 루프(L76–98)·`grade_part2` 집합 F1(L101–133)·`main`/CLI/result.json(L147–200). **바꾸는 건 §2⑦의 `P1_FIELDS`·축별 norm·배점·matchable 처리뿐**, 나머지는 채점 엔진으로 그대로 쓴다.

---

## 2. 과제마다 바꾸는 DOMAIN-SPECIFIC (체크리스트 ①~⑧)

순서대로 바꾼다. 각 항목은 **"어느 상수/함수의 어디를 어떻게"** 까지 짚는다.

### ① `policies.csv` 헤더 = 축 스키마 (단일 진실 소스)
- **어디**: CSV 1행 헤더 + `load_policies`(L199–218)의 `dict(...)` 키 + fail-loud 검증(L185–198).
- **무엇**: 판정 축 1개 = CSV 컬럼 1개. youth_policy 헤더(L8–10 docstring):
  `policy_id,name,field,poster_file,region,age_min,age_max,employment,company_size,income_max_month,income_year_max,no_house,enroll_status,marital,matchable,apply_start,apply_end`
- **어떻게**: 새 도메인의 기준 축으로 컬럼을 교체한다(예: 휴면 세그먼트면 `last_purchase_days_max,total_spend_min,channel_opt_in,…`). `policy_id`·`name`·`matchable`은 **구조 컬럼**이라 유지. `apply_start/end`처럼 **채점에 안 쓰는 참조 컬럼**은 남겨도 되지만 매칭/채점에 절대 끌어들이지 않는다(L27–29: 날짜는 만나이용 외 미사용).
- **fail-loud 추가**: 새 축에 허용값 집합이 있으면 L189–194처럼 `sys.exit` 가드를 넣는다(빈 필수값·허용 외 값·자기모순). `matchable=N`인데 자격값을 채우면 차단(L195–198)하는 패턴을 새 축에도 복제.

### ② 회원 컬럼 `MEMBER_COLS` + 합성 풀 상수
- **어디**: `MEMBER_COLS`(L550–552) · 풀 상수 `SURNAME/GIVEN/EDU`(L73–76) · `ENROLL_POOL/MARITAL_POOL/COMPANY_POOL/INCOME_YEAR_POOL`(L78–84) · `add_member`의 레코드 dict(L372–390).
- **무엇**: **각 판정 축에 1:1 대응하는 회원 컬럼**과 그 값 분포(합성 풀). 예: 정책의 `company_size` 축 ↔ 회원 `기업규모` 컬럼 ↔ `COMPANY_POOL`.
- **어떻게**: 축을 더하거나 바꾸면 (a) `MEMBER_COLS`에 컬럼 추가, (b) 그 값 풀 상수 추가, (c) `add_member` dict에 그 컬럼 생성 로직 추가(예: L368 `company = "없음" if emp=="미취업" else random.choice(COMPANY_POOL)` 같은 의존 규칙). **축과 무관한 장식 컬럼**(이메일·가입일 L387–389)은 변별에 안 쓰니 그대로 둔다.

### ③ `member_passes`의 축별 AND 조건
- **어디**: `member_passes`(L509–540).
- **무엇**: 정답 = (회원 × 정책)이 **모든 축 조건을 동시 통과(AND)**. 각 축이 `if ...: return False` 한 블록.
- **어떻게**: 축 1개 = 한 블록. 패턴을 그대로 복제한다 —
  - range 축(나이): `if p["age_min"] is not None and a < p["age_min"]: return False`(L514–517).
  - threshold 축(소득): `if p["income_max"] is not None and (m["월소득_원"] or 0) > p["income_max"]: return False`(L526). **`or 0`로 빈칸을 0 취급하되 정책 상한이 None이면 통과** — 빈칸=무관 의미를 여기서도 지킨다.
  - categorical 축(취업·학력·혼인): 허용 집합 멤버십(L520–523, 532–539).
  - boolean 축(무주택): `if p["no_house"] and m["주택소유여부"] != "아니오": return False`(L530).
  - **맨 앞 `matchable=N` 단락**(L511–512: `return False`)은 구조라 유지.

### ④ `plant_boundaries`의 축별 경계 블록 + `passing_*` 통과값 생성기
- **어디**: `plant_boundaries`(L395–473, 블록 A~I) · `passing_age/income/enroll/marital/emp/company/income_year`(L306–351).
- **무엇**: 각 축마다 **경계 회원**(min-1/min/max/max+1, 상한/상한+1, 일치/불일치)을 심고, **나머지 축은 통과값으로 고정**해 그 축이 결과를 실제로 가르게 한다. `passing_*`는 "다른 경계 회원이 통과해야 할 값"을 만든다.
- **어떻게**: 새 축마다
  1. `passing_<axis>(p)` 추가 — 그 축 요건을 확실히 만족하는 값 하나(예: `passing_income` L318–320은 `income_max` 그대로, 없으면 안전 기본값).
  2. `plant_boundaries`에 블록 추가 — 내부 헬퍼 `m(...)`(L407–415)이 다른 축을 통과값으로 채워 주므로, **그 축의 경계 두 케이스만** 부르면 된다. 예시:
     - 수치 상한 축(H 연소득, L464–467): `for iy in (max, max+1): m(..., income_year=iy)`.
     - categorical 축(I 기업규모, L469–473): 일치값 1 + 불일치값 1.
     - range 축(A 나이, L417–426): min-1/min/max/max+1.
  3. `passing_*`를 `plant_boundaries` 상단(L401–405 `pe/pm/pemp/pco/piy`)에 받아 `m()` 기본값으로 연결.
  - **만나이 미경과 함정**(A' L428–434)은 연령 축이 있으면 그대로 유지(B2 결함). 없으면 제거.

### ⑤ 출력 칸 `p1_row` / `P1COLS`
- **어디**: `P1COLS`(L553–554) · `p1_row`(L577–594).
- **무엇**: Part1(추출) 제출 양식의 칸 = 각 축의 정답값. `answer=False`면 식별칸만(L581: `[id,name,field]+[""]*10`), `True`면 정답 채움(L582–594).
- **어떻게**: `P1COLS`의 자격 칸을 새 축으로 교체하고, `p1_row`의 `answer=True` 분기에서 **빈칸=무관 규칙을 출력에도 반영**한다 — 예: `p["employment"] if p["employment"]!="무관" else ""`(L587), `"필요" if p["no_house"] else ""`(L591). 식별칸 외 칸 수(`[""]*10`)를 새 축 수에 맞춰 조정.

### ⑥ 안내시트 텍스트 `build_p1` / `build_p2`
- **어디**: `build_p1`의 `guide=[...]`(L601–620) · `build_p2`의 `guide=[...]`(L643–667).
- **무엇**: 비개발자가 양식만 보고 판정 규칙을 알도록 하는 항목/설명. **정확한 판정 규칙은 여기에 산다**(problem.md 아님).
- **어떻게**: 각 새 축마다 (a) build_p1에 "허용값·형식·예시·빈칸규칙" 한 줄, (b) build_p2에 "그 축의 자격 판정 규칙" 한 줄을 추가. 반드시 유지할 고정 문구 3종:
  - **빈칸 규칙**(L616): "빈칸 = 제약 없음(무관). 0과 빈칸은 다르다".
  - **확인 불가 규칙**(L617–618, L663–664): "명단으로 확인 못 하는 정책은 추천하지 않는다 — 확실할 때만".
  - **날짜 안 봄**(L605, L646, 해당 시): "신청 날짜는 보지 않는다 — 자격만".

### ⑦ `grade.py` — `P1_FIELDS` · 축별 norm · 배점 · matchable
- **어디**: `P1_FIELDS`(L70–75) · `norm_*`(L19–55) · `score`(L138–145) · matchable 읽기(L163–172).
- **무엇/어떻게**:
  - **`P1_FIELDS`**(L70–75): `{필드명: 정규화함수}` dict. **§2⑤ `P1COLS`의 자격 칸과 1:1로 맞춘다**(이게 §3 불변식의 grade 쪽 끝). 축 타입에 맞는 norm 배정 — 수치=`norm_int`, 자유텍스트=`norm_str`, 무관류=`norm_constraint`, 불리언류=`norm_house`/`norm_bool`.
  - **축별 norm**: 새 축에 동치 표기가 있으면 `norm_constraint`(L45: 무관/없음/제한없음/빈칸 동일) 같은 전용 정규화를 추가. **`norm_int`는 빈칸≠0을 보존**(L34)하니 수치 축은 이걸 써서 G6을 지킨다.
  - **배점**(`score` L138–145): Part1 추출 50 / Part2 F1 40 / 무결성 10. 비율은 과제 가중치에 맞게 조정하되 **차원 분리(정확도/형식/무결성)는 유지**.
  - **matchable 무결성**(L163–172): `policies.csv`에서 `matchable=N`을 읽어 `valid_policies`에서 빼고(L172), 그 정책 추천을 위반으로 잡는다(grade_part2 L118–125). 축 스키마가 바뀌어도 이 센티넬은 구조라 유지.

### ⑧ 지역 사전 `SEOUL25`/`SIDO_GU` · 이름 풀
- **어디**: `SEOUL25`(L60–62) · `SIDO_GU`(L65–69) · `DONG`(L71) · `SURNAME`/`GIVEN`/`EDU`(L73–76).
- **무엇**: 지역 축이 한국 행정구역 기반일 때의 사전, 합성 회원 이름. **알고리즘(detect_*/region_match)은 G**, 이 사전은 S.
- **어떻게**: 지역 축이 없거나 다른 체계면 사전을 교체하고 `detect_sido/gu`의 폴백 규칙(L122–124, L136–138)이 새 체계와 맞는지 확인. 이름 풀은 그대로 둬도 무방.

---

## 2.5 축 타입 쿡북 (도그푸드 검증 — 타입별 복제 패턴)

youth_policy는 일부 타입만 보여줘서, 새 도메인(예: CRM)에서 자주 막힌다. `member_passes`·`plant_boundaries`·`passing_*`를 **타입별로** 이렇게 복제하라.

| 타입 | 예 | member_passes | plant 경계 | passing(통과값) | 채점 norm |
|---|---|---|---|---|---|
| range | 나이(min~max) | `min<=v<=max` | min-1/min/max/max+1 + 생일미경과 | `(min+max)//2` | norm_int |
| threshold 상한(≤) | youth 소득 | `v<=max` | max / max+1 | max | norm_int |
| **threshold 하한(≥)** | CRM 누적구매액 | `v>=min` | min-1(탈락)/min(통과) | min | norm_int |
| **threshold 양방향** | CRM 휴면일수(min·max 동시) | `min<=v<=max` | min쪽 3 + max쪽 3 **별도 블록** | 두 제약 동시 만족 중앙값 | norm_int |
| **date-derived(날짜 파생)** | CRM 휴면일수 ← 최근주문일 | `days=(ASSIGN_DATE-날짜).days` 환산 후 threshold 규칙 | 경계 일수를 **날짜로 역산**해 컬럼 합성 | 날짜 합성 | norm_int(출력은 일수) |
| categorical 동등 | CRM 회원등급=골드 | `v==value` | value / 다른값 | value | norm_constraint |
| categorical 허용집합 | youth 취업=미취업→{미취업,단기근로} | `v in set` | 멤버 / 비멤버 | 집합 한 값 | norm_constraint |
| boolean 필수 | youth 무주택 / CRM 수신동의·앱설치 | `v=='Y'`(또는 '아니오') | Y / N 두 케이스 | 통과값 | norm_req(여러 축 공유 OK) |

**도그푸드에서 실제로 막힌 6함정 — 반드시 점검:**
1. **방향 반전(≥ vs ≤)** — youth는 상한(≤)만 예시한다. 하한(≥)이면 부등호·경계(min-1=탈락/min=통과)·passing·B3 결함 설명을 **전부 뒤집어라**.
2. **날짜 파생 축** — 고객 컬럼은 **날짜로 저장**(예 최근주문일). `member_passes`에서 `(ASSIGN_DATE - 날짜).days`로 환산해 비교하고, `plant`는 경계 일수(89/90/91)를 `ASSIGN_DATE - timedelta(days=N)`로 **역산**해 날짜를 심는다. 결정성은 ASSIGN_DATE 고정이 보장. (향후 AXES 스펙엔 `derive: date_diff(ASSIGN_DATE, col)` 파생 타입 필요.)
3. **양방향 임계(min+max 한 축)** — 경계 블록을 **두 개**(min쪽·max쪽) 심고, 다른 축의 통과값(passing)은 두 제약을 동시에 만족하는 중앙값으로.
4. **참조 컬럼 vs 판정 축 이름 충돌** — 식별·표시용 컬럼(`field`, 발송 `channel`)이 판정 축(`pref_channel` 선호채널)과 이름이 비슷하면 **축으로 오인 금지**. 판정 축만 `member_passes`·`P1_FIELDS`·`plant`에 넣고, 참조 컬럼은 출력 식별용(`p1_row` 앞쪽)으로만.
5. **norm 공유** — boolean '필수' 축이 여러 개면 같은 `norm_req`(필요≡Y≡예…)를 여러 `P1_FIELDS` 키가 **공유해도 된다**(축마다 새 norm 안 만들어도 됨).
6. **categorical 동등 vs 허용집합 구분** — "값 하나와 같으면 통과"(동등비교)는 youth의 취업 예외집합보다 **단순**하다. 헷갈리면 동등비교부터 복제하라.

> 핵심: youth 엔진 골격(`plant_boundaries`·`member_passes` 구조)은 0줄 수정으로 재사용되지만, **새 축 타입은 위 패턴으로 명시 복제**해야 한다. CRM 도그푸드는 이 8타입을 모두 거쳐 첫 빌드부터 자기채점 100을 냈다.

**날짜 파생 축 — 복붙 스니펫** (CRM·도서관 도그푸드 둘 다 여기서 시간을 썼다. youth는 날짜를 "만나이 외 미사용 참조"로 두니 *반대 신호*가 된다 — 이 스니펫이 그걸 덮는다):
```python
from datetime import date, timedelta
ASSIGN_DATE = date(2026, 6, 28)              # 결정성 1급: 고정
def elapsed_days(d):                          # 회원 날짜 컬럼 → 경과일
    return (ASSIGN_DATE - d).days
def date_for_days(n):                         # plant 역산: 경계 일수 → 날짜로 심기
    return ASSIGN_DATE - timedelta(days=n)
# member_passes 안에서 (양방향이면 두 가드 독립 배치):
#   e = elapsed_days(m["마지막대출일"])
#   if p["inactive_days_min"] is not None and e < p["inactive_days_min"]: return False  # 휴면 하한(≥)
#   if p["inactive_days_max"] is not None and e > p["inactive_days_max"]: return False  # 최근 상한(≤)
# plant_boundaries: 경계 일수 N에 대해 마지막대출일 = date_for_days(N-1)/date_for_days(N)/date_for_days(N+1) 회원을 심는다
# 출력(p1_row)·grade는 '경과일'이 아니라 프로그램의 임계 '일수'를 칸으로 둔다(휴면일수_min/최근일수_max 분리).
```

> **1:1 불변식의 예외 — 1 컬럼 → 다축.** §3의 축↔컬럼 교집합은 보통 1:1이지만, **날짜 파생은 한 회원 컬럼(마지막대출일)이 두 판정 축(휴면 min·최근 max)에 대응하는 1:多**가 정상이다. 이때 P1COLS·P1_FIELDS에는 회원 컬럼이 아니라 **축마다 칸 하나씩**(휴면일수_min, 최근일수_max) 둔다 — 교집합 불변식은 "회원 컬럼 1개"가 아니라 "판정 축 1개마다 출력/채점 칸 1개"로 읽어라.

---

## 3. 축↔컬럼 교집합 불변식 (절대 깨지 않게)

> **축 1개를 더하거나 바꾸면, 반드시 세 곳을 동반 수정한다. 하나라도 빠지면 매칭이 조용히 틀린다.**

| # | 파일·함수 | 무엇을 |
|---|---|---|
| 1 | `policies.csv` 헤더 + `load_policies`(L199–218) | 축 = CSV 컬럼 (§2①) |
| 2 | `build_dataset.py` — **합성**(`MEMBER_COLS` L550·풀 상수 L78–84·`add_member` L372–390) + **passes**(`member_passes` L509–540) + **plant**(`plant_boundaries` L395–473·`passing_*` L306–351) + **출력**(`p1_row` L577–594) | 축 = 회원 컬럼 + AND 조건 + 경계 회원 + 정답 칸 (§2②③④⑤) |
| 3 | `grade.py` — `P1_FIELDS`(L70–75) | 축 = 채점 필드 + 정규화 (§2⑦) |

**왜**: 회원 컬럼만 추가하고 `member_passes`에 조건을 안 넣으면 그 축은 정답에 영향을 못 주고(변별 0), `member_passes`만 넣고 `plant_boundaries`에 경계 회원을 안 심으면 그 함정이 모집단에 없어 측정이 안 되며(트랩 0), `P1COLS`만 넣고 `P1_FIELDS`를 안 맞추면 Part1이 그 칸을 채점하지 않는다(채점 누락). 셋이 한 몸이다.

> **향후 방향(AXES 스펙으로 자동화)**: 이 3곳 동반 수정을 손으로 하는 대신, 축 1개를 `{축명, 회원컬럼, 타입(range/categorical/threshold/boolean), 통과값생성기, 경계생성기, 채점정규화}` **AXES 스펙 한 줄**로 정의하고, 코드가 build의 plant/passes/columns와 grade의 `P1_FIELDS`를 **생성**하게 하면 불변식이 자동 충족된다(설계계획 §6.2). 현재 엔진은 손수 3곳 수정 방식이며, AXES 자동생성은 매칭 엔진 제너릭화의 다음 단계다. 적응할 때 **이 세 곳을 한 번에 같이 편집**하는 습관이 곧 그 스펙의 수동 버전이다.

---

## 4. ★ 분리형(decouple) 적용법 (기본값)

> **목표**: Part1(추출) 실패가 Part2(매칭)로 전이되지 않게 한다. 학생이 정책 자격을 잘못 추출해도 Part2는 **올바른 정답 정책표**를 입력으로 받아 매칭 역량만으로 채점되게 한다. (SKILL.md 기본값 = 분리형 / 인터뷰 Q10 기본값과 일치.)

현재 `build_dataset.py`는 Part2 제출 양식(`targeting_template.xlsx`)을 빈 표로만 주고(L712), 학생이 **Part1에서 직접 정리한 정책표**를 쓰도록 안내한다(build_p2 guide L646: "Part1에서 정리한 정책표"). 이건 **결합형**이다. 분리형으로 바꾸려면:

### 변경 지점
1. **`build_dataset.py`에 Part2용 '정답 정책표'를 별도 입력 파일로 추가 생성**한다. 이미 `p1_row(p, answer=True)`(L582–594)가 **정답 자격값**을 만들고 있으므로, 그걸 재사용해 **추천 가능 정책만**(= `matchable != 'N'`, main의 `targets` L700과 동일 기준) 담은 워크북을 하나 더 저장한다:
   ```
   # main() 안, build_p1(...answer=True) 직후에 추가
   given = [p for p in policies if p["matchable"] != "N"]   # 판별불가 정책 제외
   build_p1(DATA / "policy_table_given.xlsx", given, answer=True)   # Part2용 '주어진 정답 정책표'
   ```
   - **핵심**: `matchable=N` 정책은 **빼고**(Part2에서 추천 0건이어야 하므로 정답표에 없어야 함), 추천 가능한 정책만 **올바른 자격으로 채운** 표다. `p1_row`의 `answer=True` 산출을 그대로 정제해 `data/policy_table_given.xlsx`로 저장하는 식.
   - 빈 양식(`policy_table_template.xlsx`, L710)은 그대로 Part1 제출용으로 남긴다. 새 파일은 **Part2 입력 전용**.
2. **`build_p2`의 안내 텍스트**(L646)를 "Part1에서 정리한 정책표" → **"`data/policy_table_given.xlsx`(주어진 정답 정책표)를 입력으로 쓰라"**로 바꾼다.
3. **`problem.md` / `INPUT_GUIDE.md`**에 "2단계는 1단계 결과가 아니라 **제공된 정답 정책표**를 쓴다 — 1단계를 틀려도 2단계는 영향 없다"를 명시.
4. **채점은 그대로**: `grade.py`는 Part1(`policy_table_template.xlsx`)·Part2(`targeting_template.xlsx`)를 **독립 채점**하므로(L156–159), Part2 정답키(`targeting_answer.xlsx`)는 변경 없이 동일. 분리는 **학생 입력 경로**만 바꾸지 정답 계산을 바꾸지 않는다.

> 결합형(가혹)을 원하면(Q10 override) 1~3을 생략하고 현재 동작을 유지한다.

---

## 5. 재생성 · 자기채점 · 독립검증 루프 (바꾼 뒤 반드시)

축을 바꿨으면 아래를 순서대로 돌려 닫는다. 하나라도 실패하면 발행 금지(S10 게이트).

```bash
# 1) 재생성 — policies.csv(새 축) → 회원·양식·정답키 5개 산출
python eval/answer_key/build_dataset.py        # 경로는 과제 폴더 기준(ROOT=parents[2])

# 2) 자기채점 — 정답키로 정답 양식을 채워 채점하면 100점이어야 한다(정합성 1차 확인)
python eval/grade.py \
  --part1 eval/answer_key/policy_table_answer.xlsx \
  --part2 eval/answer_key/targeting_answer.xlsx \
  --answer-dir eval/answer_key
#   → 총점(100) 100.0 / Part1 셀정확도 100% / Part2 F1 100% 가 아니면
#     P1_FIELDS↔P1COLS 불일치(§3-3) 또는 norm 함수 오배정(§2⑦)을 의심.

# 3) 독립 재계산 — build_dataset 로직을 '재사용하지 않고' csv+규칙만으로 정답키를 다시 계산해
#    *_answer.xlsx와 셀 단위 대조. 불일치 = 발행 차단(자기충족 채점 허점 차단).
python verify/independent_recompute.py         # verify/ 참조
```

- **자기채점 100이 안 나오면**: 거의 항상 **§3 교집합 불변식 누락**(`P1_FIELDS`에 새 축을 안 넣음, 또는 `member_passes`/`plant_boundaries`/`p1_row` 중 하나 빠짐).
- **자기채점 100인데 독립 재계산이 불일치하면**: 생성·채점 양쪽에 **같은 버그**가 있는 것(예: AND 조건 부등호 방향 오류가 plant와 passes에 동시 존재). 독립 구현이 이걸 잡는다 — 이 게이트가 핵심.
- 마지막으로 `verify/adversarial_prompts.md`로 적대 리뷰(빈 region 무음 통과? `matchable=N`에 자격값? seed 누락? fail-loud 빠짐? 축↔컬럼 누락? 결함과 채점 모순?)를 돌리고, `references/checklist.md` G1~G10 발행 게이트를 통과시킨다.

---

## 부록 — 적응 빠른 점검표 (한 축 추가/교체 시)

- [ ] ① CSV 헤더에 축 컬럼 + `load_policies` dict 키 + fail-loud 가드
- [ ] ② `MEMBER_COLS` + 합성 풀 상수 + `add_member` dict에 회원 컬럼
- [ ] ③ `member_passes`에 AND 조건 1블록 (빈칸=무관 의미 보존)
- [ ] ④ `passing_<axis>` 통과값 생성기 + `plant_boundaries`에 경계 블록
- [ ] ⑤ `P1COLS` 칸 + `p1_row` 정답/식별 분기 (빈칸=무관 출력)
- [ ] ⑥ `build_p1`/`build_p2` 안내 텍스트 한 줄씩 (+ 고정 3문구 유지)
- [ ] ⑦ `grade.py` `P1_FIELDS`에 필드+norm, 배점·matchable 점검
- [ ] ⑧ 지역 사전/이름 풀 (지역 축 있을 때)
- [ ] §3 불변식: csv·build(합성·passes·plant·p1_row)·grade(P1_FIELDS) **세 곳 동반** 확인
- [ ] §4 분리형: `policy_table_given.xlsx` 생성 + 안내/문서 갱신 (기본값)
- [ ] §5 루프: 재생성 → 자기채점 100 → 독립 재계산 일치 → 적대 리뷰 → 체크리스트
