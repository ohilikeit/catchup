# 취합/통합 엔진 적응 가이드 (S5~S7) — `engines/merge/`을 새 취합 테마로 바꾸기

**목적**: 검증된 취합/통합 엔진(`engines/merge/build_dataset.py` 475줄 · `grade.py` 204줄)을 새 취합 테마·새 소스 양식·새 통합 규칙으로 **정확히 어디를 바꿔야 하는지** 단계별로 짚는다. 이 엔진은 **G(제너릭 골격) / S(도메인 내용)가 이미 함수 경계로 분리**돼 있어, 바꿀 곳은 좁고 명확하다. 레퍼런스 과제는 `problems/general/2.order_consolidation`(다채널 주문 통합: 웹·전화·제휴 3소스).

> 근거: `engines/merge/README.md`(파이프라인·통합 규칙표·매칭/검증 엔진과의 재사용 관계)·`references/archetypes.md`(취합/통합 아키타입 = "정형 다수, 양식 제각각 → 정형 하나"). 줄 번호는 `engines/merge/build_dataset.py`/`grade.py` 기준. 레퍼런스 입력: `engines/merge/orders.example.csv`(20주문, 채널조합·표기변형·결측·값충돌 전부 커버).
>
> **불변 철학**(SKILL.md "관통 철학"): 결정성 1급 · 정답=규칙 재적용(canonical 플래그 직접 베끼기 금지) · 빈칸≠0 보존 · 단일 입력 재현. 적응 중 이 중 하나라도 깨지면 그 변경은 폐기한다.
>
> **매칭/검증 엔진을 안다면**: 취합 엔진은 검증의 `txn`(1:1 키 조인) → `consolidate`(키별 **다대일 dedup**), `derive_violations`(규칙 재적용 위반 도출) → `parse_sources`+`consolidate`(소스 재파싱+통합 규칙 재적용), `expected_from_flags` → `expected_from_canonical`(플래그 의도), `cross_check`(derive==expected) → `cross_check`(consolidate==expected)로 치환된다. **Set 채점·안내시트 골격·결정성·빈칸≠0 `norm_int`·무결성 센티넬은 그대로 공유**한다. 다만 취합은 **자연 단일 산출**(통합표 1개)이라 검증의 Part1/Part2 분리형(decouple)이 **적용되지 않는다** — `grade.py`가 `--part1`만 받는다.

---

## 0. 큰 그림 — 한 과제는 코드의 어디까지 건드리나

| 무엇 | 어디 | 바꾸나? |
|---|---|---|
| 경로·결정성·`int_or_none`·`trim_text`·`load_orders` 검증 골격·`cross_check` 자기검증·`_cmp_cell`·엑셀 스타일·`write_xlsx`/`write_csv`·`build_consolidated` 골격(answer 분기)·`std_row` 패턴·`main` 흐름·grade의 `norm_str`/`norm_int`/`load_sheet`/`grade_part1`/`score`/`main` | §1 GENERIC | **그대로 둔다** |
| orders.csv 헤더(canonical 스키마)·rulebook 상수(`PRIORITY`/`CHANNELS`/`VARIANTS`/`MISSING`/`STD_COLS`)·소스 스키마 헤더(`WEB_COLS`/`PHONE_COLS`/`PARTNER_COLS`)·형식 렌더러(`to_std_date`/`fmt_comma`/`fmt_web_dt`/`fmt_slash_*`)·소스 렌더(`build_sources`)·정답 도출 한 쌍(`parse_sources`+`consolidate` ↔ `expected_from_canonical`)·안내 텍스트·grade의 `STD_FIELDS`/`norm_date`/`norm_channel`/배점 | §2 DOMAIN-SPECIFIC | **과제마다 바꾼다** |

작업 순서: **§2 체크리스트 ①~⑦을 위에서 아래로** 바꾼 뒤, §3 불변식(`consolidate` == `expected`, render↔parse 역함수)으로 누락을 점검하고, §4(채점 프리미티브)로 배점/정규화를 맞추고, §6 재생성·자기채점·독립검증 루프로 닫는다.

> ⚠ **취합 엔진만의 데이터 폴더 규칙 반전**: 매칭/검증 엔진은 운영자가 `data/`에 포스터·원본을 배치하므로 코드가 `data/`를 **만들거나 지우지 않는다**. 취합 엔진은 **반대** — `build_sources`+`write_xlsx`/`write_csv`(L452–454)가 `data/웹주문.xlsx`·`data/전화주문.csv`·`data/제휴주문.xlsx` 3소스를 **코드가 직접 렌더·기록**한다(canonical 1행을 양식이 제각각인 여러 소스로 흩뿌리는 게 이 아키타입의 본질이므로). 따라서 취합에서 소스 파일은 산출물이지 운영자 입력이 아니다.

---

## 1. 그대로 두는 GENERIC (건드리지 말 것)

아래는 테마가 바뀌어도 **메커니즘이 동일**하다. 값(상수)만 §2에서 갈아끼우고, 함수 몸통은 보존한다.

- **경로 스캐폴드** — `ROOT/DATA/ANS` + `CSV_PATH` + `mkdir`(L52–57). `ROOT = parents[2]`라 과제 폴더 위치가 바뀌어도 동작. 단 위 ⚠처럼 **취합은 `DATA`를 코드가 채운다**(소스 렌더).
- **결정성 2종** — ① `ASSIGN_DATE = date(2026,6,28)`(L59, 웹 주문일시 시각 합성 등 날짜 합성용 기준일, `datetime.now()`/`today()` 금지) ② `random.seed(20260628)`(L60). **값(날짜·시드)만 §2⑥에서 바꾸고 패턴은 보존.** (매칭의 clear+reseed는 전역 누적 상태가 있을 때만 필요 — 취합은 모든 합성이 `build_sources`의 **지역 리스트**(`web_rows`/`phone_rows`/`partner_rows`)라 불필요.)
- **순수 파서** — `int_or_none`(L74–81, 빈칸→None·콤마/공백 제거 정수)·`trim_text`(L101–103, 앞뒤 trim·내부 공백 보존). 학생 정규화 = 정답 도출 정규화에 **둘 다 동일 적용**(L36–39 철학). (`to_std_date`는 형식이 도메인이라 §2③.)
- **`load_orders` 골격**(L109–170) — `DictReader`(utf-8-sig) + 빈 행 무시(L117–120) + **order_id 중복 차단**(L121–123) + fail-loud 검증 루프. **루프 구조·중복 차단·fail-loud 메커니즘은 G**, 컬럼 스키마·허용값(`CHANNELS`/`VARIANTS`/`MISSING` 멤버십)·**결측↔값 모순 가드**(L152–160)는 S(§2①).
- **`cross_check` 자기검증**(L322–332) — `consolidate`(소스 재구성) == `expected_from_canonical`(플래그 의도)를 **주문번호 집합**(L324–327) + **셀별**(L328–332, `_cmp_cell`로 빈칸/공백 통일)로 대조, 불일치 시 즉시 `sys.exit`. **이것이 취합 엔진의 fail-loud 핵심**(생성기/입력 모순을 발행 전에 잡음). 두 함수의 내용은 S지만 **대조 메커니즘 자체는 절대 건드리지 않는다**. `_cmp_cell`(L315–319)도 G.
- **엑셀/CSV 산출 골격** — `HDR`/`HDRFILL`/`GUIDE` 스타일(L338–340)·`style_header`(L347–352)·`write_xlsx`(L355–364)·`write_csv`(L367–371). 그대로.
- **`build_consolidated`의 `answer` 분기 패턴**(L382–426) — '안내' 시트(항목/설명 2열, L387–415) + '통합주문' 데이터 시트 + freeze. `answer=False`면 빈 양식 + 예시행(L424), `True`면 정답 채움(L421–422). **한 함수로 빈양식·정답을 동시에 찍는** 비대칭 차단 패턴. 골격·분기 패턴은 G, 안내 텍스트·예시행은 S(§2⑤). `std_row`(L374–379, 빈칸 보존 출력)도 패턴은 G.
- **`main` 파이프라인**(L432–470) — 로드(L433)→소스 렌더(L436)→정답 도출(재파싱→통합→자기검증, L441–444)→엑셀 5종 산출(L452–457)→요약 print(L460–470). **흐름은 G**(파일명·시트명만 따라옴).
  > 📛 **학생 노출 네이밍**(`doc-templates.md §0.1`): 이 엔진이 찍는 학생 파일·폴더명은 한국어 역할명으로 둔다. 소스 파일은 이미 역할명(`웹주문.xlsx`·`전화주문.csv`·`제휴주문.xlsx`)이니 폴더만 `data/`→`데이터/`, 통합 양식 `*_template.xlsx`→`*_제출용.xlsx`. 안내시트 텍스트·problem.md도 쉬운 말(dedup·우선순위·행집합 F1 등 전문어 금지 — 통합 규칙·유일 정답은 보존, 실데이터 컬럼명은 예외). 파일명을 정하면 그 이름을 build 출력·docstring·안내시트·README/INPUT_GUIDE/evaluation·grade 사용예시까지 동기화하고, 재생성→자기채점 100점으로 확인.
- **`grade.py` 거의 전부** — `norm_str`(L28–32, 모든 공백 제거)·`norm_int`(L35–43, 빈칸≠0 보존)·`load_sheet`(L83–95)·`rowkey`(L98–99)·`grade_part1` 셀 Exact + 행집합 F1 루프(L103–152)·`score`(L157–167)·`main`/CLI/result.json(L170–199). **바꾸는 건 §2⑦의 `STD_FIELDS`·`norm_date`/`norm_channel` 같은 형식별 norm·배점뿐**, 나머지는 채점 엔진으로 그대로 쓴다.

---

## 2. 과제마다 바꾸는 DOMAIN-SPECIFIC (체크리스트 ①~⑦)

순서대로 바꾼다. 각 항목은 **"어느 상수/함수의 어디를 어떻게"** 까지 짚는다.

### ① `orders.csv` 헤더 = canonical 스키마 (단일 진실 소스)
- **어디**: CSV 1행 헤더 + `load_orders`(L109–170)의 `dict(...)` 키(L162–167) + fail-loud 검증(L116–160).
- **무엇**: 한 행 = **하나의 통합 엔티티(canonical)** + 그것이 **어느 소스들에 어떻게 흩어지는지**의 노브. 주문 통합 헤더(L11–16 docstring):
  `order_id,고객명,상품명,수량,금액_원,주문일,channels,표기변형,결측`
  - **엔티티 키** = `order_id`(L116, 유일). dedup·행집합 채점의 키.
  - **표준 값** = `고객명·상품명·수량·금액_원·주문일`(통합표 정답이 곧 이 값).
  - **흩뿌림 노브** = `channels`(파이프구분, 1~다 — 2개 이상이면 그 엔티티가 여러 소스에 **중복 렌더** = dedup 대상, L134).
  - **함정 노브** = `표기변형`(none/상품명공백/고객명공백 — trim 함정)·`결측`(none/금액결측/주문일결측 — 빈칸 보존 함정).
- **어떻게**: 새 테마의 **표준 컬럼 + 소스 분배(channels) + 함정 종류**로 노브를 교체한다. `order_id`(키)는 **구조 컬럼**이라 유지. `channels`는 소스가 무엇이든 "어느 소스들에 등장하나"의 일반 노브 — 소스 이름만 바꾼다.
- **fail-loud 추가**: 새 노브의 허용값 멤버십(L145–148 `VARIANTS`/`MISSING`)·양의 정수 제약(L130–132)·키 중복 차단(L121–123)·**자기모순 가드**(L152–160: "결측=금액결측인데 금액값이 채워짐", "결측 아님인데 빈칸")를 새 함정 조합에도 복제한다. "결측=Y인데 그 칸에 값"은 **무의미한 입력**이므로 차단해야 `cross_check`가 성립한다.

### ② rulebook 상수 + 소스 스키마 헤더
- **어디**: `PRIORITY`/`CHANNELS`(L63–64) · `VARIANTS`/`MISSING`(L65–66) · `STD_COLS`(L68) · `WEB_COLS`/`PHONE_COLS`/`PARTNER_COLS`(L342–344).
- **무엇**: 통합 규칙 상수(소스 우선순위·허용 함정 집합)와 **표준 출력 스키마**(`STD_COLS` = 통합표 칸) + **각 소스의 양식이 다른 헤더**(소스마다 컬럼명이 제각각).
- **어떻게**:
  - `PRIORITY`(L63): **값 충돌 시 우선순위**(낮을수록 우선). 소스 이름·서열을 새 테마로 교체(예: 재고면 `{"본사": 0, "지점": 1, "위탁": 2}`). `CHANNELS = set(PRIORITY)`는 자동 파생이라 유지.
  - `STD_COLS`(L68): 통합표 표준 칸. **§2⑤ `build_consolidated`·`std_row`와 §2⑦ grade의 `STD_FIELDS`가 이 칸을 따른다**(§3 불변식). 키 + 표준 값 + 출처표시 칸.
  - **소스 헤더 `*_COLS`**(L342–344): 각 소스의 **다른 컬럼명**(웹 `주문번호/고객명/상품/수량/금액/주문일시` ↔ 전화 `order_id/name/item/qty/amount/date` ↔ 제휴 `협력사주문ID/구매자/품목/개수/결제액/일자`). 새 테마의 소스별 실제 양식차로 교체 — **이 헤더 차이가 "컬럼명 표준화" 함정의 원천**.

### ③ 형식 렌더러 + 소스 렌더 `build_sources` (양식차·표기변형·결측·값충돌 주입)
- **어디**: 형식 렌더러 `to_std_date`(L84–98)·`fmt_comma`(L181–182)·`fmt_web_dt`(L185–188)·`fmt_slash_ymd`(L191–195)·`fmt_slash_mdy`(L198–202)·`shift_date`(L205–209)·`pad_spaces`(L176–178) · 렌더 본체 `build_sources`(L212–261).
- **무엇**: canonical 1행을 **각 소스의 스키마·형식으로 렌더**하며 함정을 주입한다. 취합 아키타입의 심장 절반(나머지 절반은 ④ 정답 도출).
  - **양식차(형식 렌더러)**: 같은 값을 소스마다 다른 표기로. 금액=웹 천단위콤마 `"1,200,000"`(L254) / 전화·제휴 정수(L257,259). 날짜=웹 `YYYY-MM-DD HH:MM`(L254 `fmt_web_dt`) / 전화 `YYYY/MM/DD`(L256 `fmt_slash_ymd`) / 제휴 `MM/DD/YYYY`(L259 `fmt_slash_mdy`).
  - **중복 렌더(dedup 대상)**: `channels`가 다채널이면 `for ch in sorted(present, ...)`(L233)로 같은 `order_id`를 **여러 소스에 렌더**.
  - **표기변형(trim 함정)**: `pad_spaces`(L176–178)로 앞뒤 공백 주입(L238–242). 모든 채널 렌더에 적용 → trim 정규화로 사라짐.
  - **결측(빈칸 보존 함정)**: 금액결측/주문일결측이면 그 칸을 빈값으로(L254–260 `"" if amount is None`).
  - **값 충돌(우선순위 함정)**: 다채널일 때 **비우선 채널만** 한 필드를 다른 값으로 주입(L221–251) — 우선 채널 = canonical 그대로, 비우선 = `+오프셋`(금액 L247)·`+개수`(수량 L249)·`±일`(날짜 L251 `shift_date`). 결측 필드는 충돌 대상에서 제외(L225–228).
- **어떻게**: 소스가 N개면 `*_rows` N개 리스트 + 각 소스의 `append([...])`에 그 소스 양식 적용. **새 양식차마다 형식 렌더러 한 개**(예: 통화 `$1,200.00`·날짜 `DD.MM.YYYY`). 값 충돌은 **비우선 채널에만** 주입하는 규칙을 유지(우선 채널은 정답이어야 하므로). 형식 렌더러는 **④ `parse_sources`의 역함수**여야 한다(§3 불변식).

### ④ 정답 도출 한 쌍 — `parse_sources`+`consolidate` ↔ `expected_from_canonical`
- **어디**: `parse_sources`(L267–282) · `consolidate`(L285–300) · `expected_from_canonical`(L303–312). **이 셋이 취합 엔진의 심장 절반**.
- **무엇**:
  - **`parse_sources`(L267–282)**: 렌더된 3소스 셀을 **다시 파싱·정규화**한다 — `to_std_date`·`int_or_none`·`trim_text`를 ③ 렌더러의 **역으로** 적용(날짜 3형식→ISO, 콤마제거→정수, trim). 출력 = 주문번호별 채널 출현 레코드.
  - **`consolidate`(L285–300)**: 주문번호로 그룹(L288–289) → **dedup 1행**. 값 = `PRIORITY` 최우선 채널(L292–293 `g_sorted[0]`). 출처채널 = 등장 채널 **정렬·파이프결합**(L294 `"|".join(sorted(...))`). **canonical 플래그를 직접 베끼지 않는다**(L36–38 철학) — 소스를 재파싱해 통합 규칙을 재적용하는 게 독립검증·결정성의 근거.
  - **`expected_from_canonical`(L303–312)**: canonical이 **의도한** 통합행(자기검증/fail-loud 전용). 플래그를 직접 읽는다.
- **어떻게**: 새 통합 규칙 1개 = (a) `parse_sources`에 그 소스 형식 → 표준값 파싱 1줄, (b) `consolidate`에 그 규칙 도출(우선순위·집계·결합), (c) `expected_from_canonical`에 의도 1블록. **(a)+(b)와 (c)가 모든 엔티티에서 일치해야** `cross_check`(L322–332)를 통과한다 — 불일치 = 생성기 버그 발행 차단. 형식 파싱은 ③ 렌더러와 **정확히 역함수**여야 한다(렌더 `fmt_slash_mdy` ↔ 파싱 `to_std_date`).

### ⑤ 표준 출력 `build_consolidated` 안내 텍스트 + `std_row`
- **어디**: `std_row`(L374–379) · `build_consolidated`의 `guide=[...]`(L387–407) · 예시행(L424).
- **무엇**: 통합표 칸(표준 스키마) + 비개발자가 양식만 보고 통합 규칙을 알도록 하는 안내. **정확한 통합 규칙은 안내시트에 산다**(problem.md 아님).
- **어떻게**:
  - `std_row`(L374–379): `STD_COLS` 순서로 셀. **빈칸 보존 규칙 유지**(L377–378: `"" if rec["수량"] is None else ...`, `rec["주문일"] or ""`). 수량/금액이 None이면 빈칸(0 아님).
  - **안내시트 고정 문구**(반드시 유지, 각 통합 규칙 한 줄):
    - **★중복 제거**(L396): "같은 주문번호가 여러 채널에 있으면 1행으로 합친다(여러 줄로 두면 감점)".
    - **★출처채널**(L397): "등장 채널을 알파벳순 정렬해 파이프(|)로 잇는다".
    - **★값 충돌 우선순위**(L398–399): "채널마다 값이 다르면 우선순위 높은 채널 값" — **서열을 명시**(web > partner > phone).
    - **날짜/금액/공백 정규화**(L400–403): 각 소스 형식 → 표준 변환 규칙.
    - **★빈칸 보존**(L404): "원본 결측 칸은 비운다. 0과 빈칸은 다르다(빈칸을 0으로 채우면 감점)".
  - 예시행(L424)은 "실제 답 아님, 채점 시 무시"로 명시. 새 표준 스키마 칸 수에 맞춰 예시값 교체.

### ⑥ 고정 기준일·시드
- **어디**: `ASSIGN_DATE`(L59) · `random.seed`(L60).
- **무엇/어떻게**: 새 과제도 **고정값**을 둔다(`datetime.now()` 금지). 시각/오프셋/공백 패턴 합성이 모두 이 시드에 묶여 같은 orders.csv = 같은 3소스·정답(셀 값 동일; xlsx 바이트는 zip 타임스탬프만 다름). 날짜 파생 충돌(시점차)을 쓰면 `ASSIGN_DATE`를 기준일로 역산(매칭/검증 가이드 §2.5 날짜 스니펫과 동형). 시드는 임의 고정값 1개.

### ⑦ `grade.py` — `STD_FIELDS` · 형식별 norm · 배점
- **어디**: `KEY`(L24) · `norm_date`(L46–65) · `norm_channel`(L68–74) · `STD_FIELDS`(L77–80) · `score`(L157–167).
- **무엇/어떻게**:
  - **`STD_FIELDS`**(L77–80): `{필드명: 정규화함수}` dict. **§2②`STD_COLS`·§2⑤`std_row`의 채점 칸과 1:1로 맞춘다**(§3 불변식의 grade 쪽 끝). 수치 칸은 `norm_int`(빈칸≠0 보존, L35–43 → 결측 빈칸 vs 수량 0 구분), 날짜 칸은 `norm_date`, 자유텍스트는 `norm_str`, 출처표시는 `norm_channel`.
  - **형식별 norm**: 새 양식차에 동치 표기가 있으면 전용 정규화를 추가/교체. `norm_date`(L46–65)는 3형식+엑셀 datetime(`T`)을 흡수, `norm_channel`(L68–74)은 토큰 분해→정렬→재결합(순서·공백 무관). **새 형식(통화·다른 날짜형식)이면 여기에 흡수 규칙 추가** — 학생 표기 관용을 norm이 처리(G9 과민채점 금지).
  - **배점**(`score` L157–167): Part1 셀 Exact 60 / 행집합 Set-F1 30 / 무결성 10. 비율은 과제 가중치에 맞게 조정하되 **차원 분리(정확도/형식/무결성)는 유지**.
  - **무결성**(L160–161): 유령 주문번호(미존재 키)·중복 미제거(같은 키 다중 행)를 건당 0.5점 감점. `KEY`(L24)는 행집합 키라 구조라 유지.

---

## 2.5 양식차·통합규칙 타입 쿡북 (테마별 복제 패턴)

주문 통합은 일부 타입만 보여줘서, 새 테마(재고·광고비·인사명부 등)에서 자주 막힌다. **렌더러(build)↔파서(grade/정답)를 역함수 짝으로** 복제하라.

| 타입 | 예 | build 렌더(③) | parse/정답(④) | grade norm(⑦) |
|---|---|---|---|---|
| 날짜 형식차 | YYYY/MM/DD ↔ MM/DD/YYYY ↔ ISO+시각 | `fmt_slash_ymd`/`fmt_slash_mdy`/`fmt_web_dt` | `to_std_date`(역) | `norm_date` |
| 수치 표기차 | 천단위 콤마 vs 정수 | `fmt_comma` / 정수 그대로 | `int_or_none`(콤마제거) | `norm_int`(빈칸≠0) |
| **통화·소수** | `$1,200.00` | `f"${n/100:,.2f}"` 렌더 | 통화기호·콤마 제거→정수(원/센트) | `norm_int` 또는 전용 |
| 컬럼명 표준화 | 소스마다 헤더 다름 | `*_COLS` 다르게 | `parse_sources`에서 위치로 매핑 | (헤더는 채점 안 함) |
| 공백 표기변형(FP함정) | 앞뒤 공백 | `pad_spaces` 주입 | `trim_text`로 제거 | `norm_str`(공백제거) |
| 결측(빈칸 보존) | 금액·날짜 비움 | 빈값 렌더 | None 보존 | `norm_int`/`norm_date` 빈칸 보존 |
| **dedup(중복 렌더)** | 다채널 동일 주문 | `channels` 다채널→여러 소스 | `consolidate` 그룹→1행 | 행집합 정밀도 분모=제출 행 전체 |
| **값 충돌(우선순위)** | 채널마다 금액 다름 | 비우선 채널만 오프셋 주입 | `PRIORITY` 최우선 채널 값 택 | 셀 Exact로 자연 처벌 |
| **집계 결합** | 다소스 수량 합산 | 소스마다 부분값 | `consolidate`에서 `sum(...)` | `norm_int` |

**테마 전환에서 실제로 막히는 5함정 — 반드시 점검:**
1. **렌더↔파서 비대칭** — ③ 형식 렌더러와 ④ 파싱이 **정확히 역함수**가 아니면 `cross_check`가 막는다(이게 안전장치). 새 형식은 **렌더·파서를 같이** 추가하고, 한쪽만 고치지 마라.
2. **결측 + 값 노브 모순** — "결측인데 그 칸에 충돌값 주입"은 무의미. `build_sources`의 결측-필드 충돌 제외(L225–228)와 `load_orders` 모순 가드(L152–160)를 새 결측/값 조합마다 복제.
3. **우선순위 충돌은 비우선 채널에만** — 우선 채널 값은 곧 정답이므로 절대 변형 금지(L244 `not is_winner`). 단일 채널 엔티티는 충돌 자체가 없음(L223 `len(present) >= 2`).
4. **dedup 출처표시 = 정렬 결합** — `consolidate`(L294)와 `expected`(L310)가 **둘 다 `sorted`** 후 결합해야 일치. grade `norm_channel`(L68–74)도 정렬 흡수 — 세 곳 정렬 규칙 동일.
5. **빈칸 보존을 0으로 채우지 마라** — 결측은 `std_row`·`norm_int` 양쪽에서 빈칸 유지. 0으로 채우면 "0과 빈칸은 다르다" 위반(채점에서 셀 오답).

> 핵심: 취합 골격(`build_sources`·`parse_sources`·`consolidate`·`cross_check` 구조)은 0줄 수정으로 재사용되지만, **새 양식차/통합규칙은 위 패턴으로 렌더↔파서 한 쌍을 명시 복제**해야 한다.

---

## 3. 정답=계산/규칙 불변식 (절대 깨지 않게)

> **통합 규칙 1개 또는 소스 형식 1개를 더하거나 바꾸면, 반드시 동반 수정한다. 하나라도 빠지면 채점이 조용히 틀린다.**

| # | 파일·함수 | 무엇을 |
|---|---|---|
| 1 | `orders.csv` 헤더 + `load_orders`(L109–170) | canonical 값·소스 분배·함정 노브 = CSV 컬럼 (§2①) |
| 2 | `build_dataset.py` — **렌더**(`build_sources` L212–261 + 형식 렌더러) + **파싱**(`parse_sources` L267–282) + **통합**(`consolidate` L285–300) + **의도**(`expected_from_canonical` L303–312) | 형식차·통합규칙 = 렌더 + 재파싱 + 규칙도출 + 플래그의도 (§2③④) |
| 3 | `build_dataset.py` — 출력(`STD_COLS` L68, `std_row` L374–379, 안내 L387–407) | 표준값 = 통합표 칸 + 안내 규칙 (§2②⑤) |
| 4 | `grade.py` — `STD_FIELDS`(L77–80) + 형식별 norm(`norm_date`/`norm_channel` …) | 통합표 칸 = 채점 필드 + 동치 흡수 정규화 (§2⑦) |

**두 겹의 불변식이 핵심**:
- **(가) 렌더↔파서 역함수**: ③ `fmt_*`로 흩뿌린 형식을 ④ `parse_sources`가 정확히 되돌려야 `consolidate`가 canonical을 복원한다. 어긋나면 `cross_check`가 발행을 막는다.
- **(나) consolidate ↔ expected 이중 정의**: 검증 엔진의 `derive`↔`expected`와 동형. 통합 규칙을 `consolidate`(소스 재적용)와 `expected_from_canonical`(플래그 의도) **두 곳에 따로 정의**하고 `cross_check`로 대조 — 이 이중 정의 자체가 "정답이 곧 규칙"을 강제한다. canonical을 직접 베껴 정답을 만들면(=expected만 쓰고 consolidate를 건너뛰면) 독립검증·결정성 근거가 무너진다(L36–38).

**왜**: 형식 렌더만 추가하고 `parse_sources`에 역파싱을 안 넣으면 그 소스 값이 정답에 안 들어가고(채점 누락), `consolidate`만 고치고 `expected`를 안 맞추면 `cross_check`가 막거나 — 더 나쁘게 둘 다 같은 방향으로 틀리면 자기충족 버그가 통과한다(§6 독립검증이 이걸 잡음). `STD_FIELDS`를 `STD_COLS`와 안 맞추면 그 칸이 채점에서 누락된다. 네 곳이 한 몸이다.

---

## 4. 채점 프리미티브 (이 엔진 고유: Set+Exact 병합·dedup·정규화·다소스 양식차)

취합 엔진의 채점은 **Set(행집합) + Exact(정규화 셀)** 두 축을 한 산출(통합표)에서 동시에 잰다. 매칭(Part1 추출+Part2 매칭)·검증(Part1 대사+Part2 위반)과 달리 **단일 산출**이라, 이 두 축이 같은 표 위에 겹쳐 있다.

### 4.1 Set(행) — 주문번호 행집합 F1 (`grade_part1` L103–152)
- **키 = 주문번호**(`KEY` L24, `rowkey` L98). 정답 키 집합 `A`(L104) vs 제출 키 집합 `S_list`(L106–110).
- **★정밀도 분모 = 제출 데이터 행 전체**(L116 `sub_total = sum(len(lst) ...)`, L120 `prec = len(tp)/sub_total`). 이게 취합 엔진의 **결정적 변형**: **dedup 실패(같은 주문번호 2행+)와 유령 행이 그대로 FP가 되어 정밀도를 떨어뜨린다**. 재현율은 정답 키 기준(L121, missing=누락). 매칭/검증의 Set-F1은 고유 키 집합만 비교하지만, 취합은 **"행을 합쳤는가"를 분모로 처벌**한다.
- 빈 정답+빈 제출 = 1.0 가드(L117–118).

### 4.2 Exact(정규화 셀) (L124–137)
- 정답 키마다(중복 제출이면 첫 행, L128 `(S_list.get(k) or [{}])[0]`) `STD_FIELDS` 6칸을 **정규화 후 셀 단위 대조**(L129–135). 필드별 정답률 집계(`per_field`).
- **정규화가 양식차를 흡수**: `norm_int`(콤마·`.0` 제거, **빈칸≠0** L37), `norm_date`(3형식+엑셀 datetime→ISO), `norm_str`(모든 공백 제거 — trim 함정 + 학생 표기 관용), `norm_channel`(토큰 정렬 — 순서 무관). **잘못된 값**(우선순위 오선택·날짜 오해석·dedup 시 엉뚱한 채널 값)은 셀 Exact에서 자연 처벌.

### 4.3 무결성 센티넬 (L139–141, `score` L160–161)
- **유령 주문번호**(미존재 키 = 정밀도 FP `ghost` L140) + **중복 미제거**(`dup` = 같은 주문번호 2행+ L141). 각 건당 0.5점 감점(`viol*0.5`). dedup을 안 한 제출은 **행집합 정밀도(4.1)와 무결성(4.3) 양쪽에서** 처벌받는다(이중 신호).

### 4.4 배점 (`score` L157–167)
- 셀 Exact 60 / 행집합 F1 30 / 무결성 10 = 100. **취합은 "정확히 합쳤는가(셀)"가 주, "빠짐없이·중복없이(행집합)"가 부**. 차원 분리(정확도/형식/무결성)는 유지하되 비율만 테마 가중치로 조정.

> **다소스 양식차 = 함정의 원천이자 채점의 본질**: 같은 엔티티가 소스마다 다른 양식·표기·값으로 흩어진 것을 **하나로 정규화·dedup·우선순위 적용**해 복원하는 능력을 잰다. 그래서 채점 정규화(norm_*)는 **양식차/표기관용은 너그럽게**(G9 과민채점 금지), **통합 규칙 위반(dedup 실패·우선순위 오선택·빈칸→0)은 엄격하게** 처벌하도록 비대칭으로 설계됐다.

---

## 5. 새 취합 테마로 적응 — 워크스루 2종

### 워크스루 A — 다지점 재고 통합 (`GEN-L2-Y2`, 3소스 · 집계 결합)
"본사·지점·위탁 3곳 재고 파일을 표준 재고표 한 장으로 통합". 같은 SKU가 여러 보관처에 흩어져 있고 **수량은 합산**, 단가는 우선순위.

- **① orders.csv → `stock.csv`**: `sku,상품명,규격,표준단가,locations,표기변형,결측` — `locations`(파이프구분 보관처 = 중복 렌더 노브), 결측=단가결측 등.
- **② rulebook**: `PRIORITY = {"본사":0,"지점":1,"위탁":2}`. `STD_COLS = [SKU,상품명,규격,총수량,표준단가,보관처]`. `*_COLS` = 소스별 재고 양식차(본사 `품번/품명/...` ↔ 위탁 `consignment_id/...`).
- **③ build_sources**: 3소스 렌더. 수량은 **보관처별 부분 수량**으로 흩고(집계 결합 타입, §2.5), 단가는 비우선 보관처에 충돌 주입. 양식차 = 단가 통화표기·날짜 입고일 형식차.
- **④ parse/consolidate/expected**: `consolidate`에서 **수량 = `sum(부분수량)`**(주문 통합의 우선순위-택일과 달리 **합산**), 단가 = 우선순위 보관처, 보관처 = 정렬 결합. `expected_from_canonical`에 합산 의도. cross_check로 검증.
- **⑦ grade**: `STD_FIELDS`에 총수량(`norm_int`)·단가·보관처(`norm_channel` 재사용). 무결성=유령 SKU+중복 미제거.
- **공유 그대로**: Set+Exact·무결성·결정성·안내 골격. **자연 단일 산출**이라 분리형 N/A.

### 워크스루 B — 다플랫폼 광고비 통합 (`MKT-L2-Y4`, 3소스 · 통화·날짜 형식차)
"구글·메타·네이버 일별 광고 리포트를 표준 통합표로". 같은 (캠페인,일자) 키가 플랫폼마다 다른 통화·지표명·날짜형식.

- **① csv**: `key,캠페인,일자,노출,클릭,비용_원,platforms,표기변형,결측` — `platforms`(중복 렌더), key=`캠페인+일자`.
- **② rulebook**: `PRIORITY = {"google":0,"meta":1,"naver":2}`. `STD_COLS = [키,캠페인,일자,노출,클릭,비용_원,출처플랫폼]`. `*_COLS` = 플랫폼별 리포트 헤더(google `campaign/impressions/clicks/cost` ↔ naver `캠페인명/노출수/...`).
- **③ build_sources**: google 비용 `$12.34`(USD), naver `12,340원`, meta 정수 — **통화·형식차**(§2.5 통화 타입, 렌더러 `fmt_usd`/`fmt_won` 추가). 일자 형식도 플랫폼마다.
- **④ parse**: `parse_sources`에 통화 정규화(USD→원 환산 or 센트 정수화 — **렌더의 정확한 역함수**). consolidate에서 노출·클릭 합산 or 우선순위(규칙 정의에 따라), 비용 우선순위 플랫폼.
- **⑦ grade**: `norm_int`에 통화기호 흡수 규칙 추가(또는 전용 norm). `STD_FIELDS` 비용·노출·클릭.
- **주의**: **렌더↔파서 역함수 불변식(§3-가)이 통화 환산에서 가장 잘 깨진다** — `fmt_usd`(렌더)와 파싱 환산 계수가 어긋나면 cross_check가 즉시 막는다. 환율은 **고정 상수**로(결정성).

> 두 워크스루 모두 **§1 GENERIC은 0줄 수정**, §2 체크리스트 ①~⑦만 바꾼다. 핵심 불변식(§3): 렌더↔파서 역함수 + `consolidate`↔`expected` 이중 정의 + `STD_FIELDS`↔`STD_COLS` + `cross_check` 통과 + 독립 재계산 일치.

---

## 6. 재생성 · 자기채점 · 독립검증 루프 (바꾼 뒤 반드시)

소스/통합규칙을 바꿨으면 아래를 순서대로 돌려 닫는다. 하나라도 실패하면 발행 금지(S10 게이트).

```bash
# 1) 재생성 — orders.csv(새 노브) → 3소스·통합양식·통합정답 산출.
#    cross_check가 consolidate==expected를 검사하므로, 통과 못 하면 여기서 중단된다(1차 자기검증).
python eval/answer_key/build_dataset.py
#   콘솔: canonical 주문 N건 / 3소스 행수(중복 포함) / 단일·다채널 / 값충돌 주입 / 빈칸 수 (자기검증 통과)

# 2) 자기채점 — 정답키로 채점하면 100점이어야 한다(정합성 2차 확인). ★취합은 단일 산출 → --part1만.
python eval/grade.py \
  --part1 eval/answer_key/consolidated_answer.xlsx \
  --answer-dir eval/answer_key
#   → 총점(100) 100.0 / 셀정확도 100% / 행집합 F1 100% 가 아니면
#     STD_FIELDS↔STD_COLS 불일치(§3-4) 또는 norm 함수 오배정(§2⑦)을 의심.

# 3) 독립 재계산 — build_dataset 로직을 '재사용하지 않고' 3소스 파일 + 통합 규칙만으로
#    통합표를 다시 계산해 consolidated_answer.xlsx와 셀·행집합 대조. 불일치 = 발행 차단.
python verify/independent_recompute.py         # verify/ 참조
```

- **cross_check가 막으면**(1단계 중단): ③ 렌더 ↔ ④ 파서 **역함수 비대칭**(§3-가) 또는 `consolidate`↔`expected` 비대칭(§3-나) — 형식 변환·우선순위·dedup 정렬·결측 처리 중 하나가 두 곳에서 다르다.
- **자기채점 100이 안 나오면**: 거의 항상 **§3 불변식 누락**(`STD_FIELDS`에 새 칸을 안 넣음, 또는 `norm_*`가 양식차를 못 흡수, 또는 `std_row` 빈칸 보존 누락).
- **자기채점 100인데 독립 재계산이 불일치하면**: 생성·채점 양쪽에 **같은 버그**(예: `consolidate`와 `expected`에 동일한 우선순위 오류 — `cross_check`는 둘이 *서로* 같으면 통과하므로 못 잡는다). **독립 재계산이 이 자기충족 허점을 잡는 게이트**다 — 취합은 렌더↔파서 + consolidate↔expected 이중 정의가 둘 다 틀릴 수 있어 매칭보다 더 중요하다.
- 마지막으로 `verify/adversarial_prompts.md`로 적대 리뷰(dedup 실패가 정밀도·무결성에 잡히나? 우선순위 오선택이 셀 오답이 되나? 빈칸을 0으로 채웠나? 표기변형/통화/날짜 형식차를 norm이 흡수하나? 값충돌이 비우선 채널에만 갔나? seed 누락?)를 돌리고, `references/checklist.md` G1~G10 발행 게이트를 통과시킨다.

---

## 부록 — 적응 빠른 점검표 (소스/통합규칙 추가·교체 시)

- [ ] ① orders.csv 헤더에 canonical 값·소스 분배(`channels`)·함정 노브 + `load_orders` dict 키 + fail-loud 가드(결측↔값 모순·키 중복 포함)
- [ ] ② rulebook 상수(`PRIORITY`/`STD_COLS`) + 소스 스키마 헤더 `*_COLS`(양식차)
- [ ] ③ 형식 렌더러(`fmt_*`/`to_std_date`) + `build_sources` 주입(양식차·표기변형·결측·값충돌 — 비우선 채널만)
- [ ] ④ 정답 도출 한 쌍 — `parse_sources`(렌더의 역) + `consolidate`(dedup·우선순위·정렬) ↔ `expected_from_canonical` (cross_check로 대조)
- [ ] ⑤ `STD_COLS`/`std_row`(빈칸 보존) + 안내 텍스트 (+ 고정 문구: 중복제거·출처채널 정렬·우선순위·빈칸보존)
- [ ] ⑥ `ASSIGN_DATE`/`seed` 고정 (환율 등 파생 상수도 고정)
- [ ] ⑦ `grade.py` `STD_FIELDS`+형식별 norm + 배점 점검
- [ ] §3 불변식: **렌더↔파서 역함수** + **consolidate↔expected 이중 정의** + `STD_FIELDS`↔`STD_COLS` 동반 확인
- [ ] §4 채점: Set 정밀도 분모=제출 행 전체(dedup 처벌) + Exact 정규화 흡수 + 무결성 센티넬
- [ ] (분리형 N/A — 취합은 자연 단일 산출, `grade.py --part1`만)
- [ ] §6 루프: 재생성(cross_check 통과) → 자기채점 100 → 독립 재계산 일치 → 적대 리뷰 → 체크리스트
