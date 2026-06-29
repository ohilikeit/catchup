# 검증/감사 엔진 적응 가이드 (S5~S7) — `engines/audit/`을 새 대사·감사 테마로 바꾸기

**목적**: 검증된 검증/감사 엔진(`engines/audit/build_dataset.py` 464줄 · `grade.py` 195줄)을 새 대사 테마·새 감사 규칙으로 **정확히 어디를 바꿔야 하는지** 단계별로 짚는다. 이 엔진은 **G(제너릭 골격) / S(도메인 내용)가 이미 함수 경계로 분리**돼 있어, 바꿀 곳은 좁고 명확하다. 레퍼런스 과제는 `problems/general/1.three_way_match`(3종 대사: 발주서·입고증·세금계산서).

> 근거: 매칭 엔진과의 관계·계약은 `engines/audit/README.md`·`references/archetypes.md` §6(엔진 계약). 줄 번호는 `engines/audit/build_dataset.py`/`grade.py` 기준. 레퍼런스 입력: `engines/audit/cases.example.csv`(20거래, 위반유형·경계 전부 커버).
>
> **불변 철학**(SKILL.md "관통 철학"): 결정성 1급 · 정답=규칙 재적용(플래그 직접 읽기 금지) · 정상은 예외에 안 올림(올리면 FP) · 단일 입력 재현. 적응 중 이 중 하나라도 깨지면 그 변경은 폐기한다.
>
> **매칭 엔진을 안다면**: 검증 엔진은 매칭의 `member_passes`(축별 AND 필터) → `derive_violations`(규칙 재적용 위반 도출), `plant_boundaries`(경계 회원 심기) → `cases.csv`(운영자가 결함을 직접 명세), `member`(데카르트 곱) → `txn`(1:1 키 조인)으로 치환된다. **Set-F1 채점(`grade_part2`)·안내시트 골격·결정성 3종·빈칸≠0 `norm_int`·무결성 센티넬은 그대로 공유**한다.

---

## 0. 큰 그림 — 한 과제는 코드의 어디까지 건드리나

| 무엇 | 어디 | 바꾸나? |
|---|---|---|
| 경로·결정성·파서·`cross_check` 자기검증·엑셀 스타일·`write_table`·`build_reconcile`/`build_exception` 골격·`main` 흐름·grade 거의 전부 | §1 GENERIC | **그대로 둔다** |
| cases.csv 시나리오 스키마·결함 주입(`build_tables`)·rulebook 상수·위반유형(`VIOLATIONS`/`REASON`)·정답 도출(`derive_violations`)·자기검증 의도(`expected_from_flags`)·소스 헤더·Part1 조인 칸·grade의 `RECON_FIELDS`/`norm_vio`/배점 | §2 DOMAIN-SPECIFIC | **과제마다 바꾼다** |

작업 순서: **§2 체크리스트 ①~⑦을 위에서 아래로** 바꾼 뒤, §3 불변식(`derive` == `expected`)으로 누락을 점검하고, §4(분리형) 적용, §5 재생성·자기채점·독립검증 루프로 닫는다.

---

## 1. 그대로 두는 GENERIC (건드리지 말 것)

아래는 테마가 바뀌어도 **메커니즘이 동일**하다. 값(상수)만 §2에서 갈아끼우고, 함수 몸통은 보존한다.

- **경로 스캐폴드** — `ROOT/DATA/ANS` + `mkdir`(L60–66). `ROOT = parents[2]`라 과제 폴더 위치가 바뀌어도 동작. **운영자 배치 원본 스캔(`data/sources/`)은 코드가 만들거나 지우지 않는다**(L64 주석, 매칭 엔진과 동일 규칙).
- **결정성 2종** — ① `ASSIGN_DATE = date(2026,6,28)`(L68, 장부일자 합성용 기준일 상수, `datetime.now()`/`today()` 금지) ② `random.seed(20260628)`(L69). **값(날짜·시드)만 §2⑥에서 바꾸고 패턴은 보존.** (매칭의 clear+reseed는 전역 누적 상태가 있을 때만 필요 — 검증 엔진은 모든 합성이 `build_tables`의 지역 리스트라 불필요.)
- **입력 파서** — `int_or_none`(L90–97, 빈칸→None·콤마/공백 제거 정수)·`yn`(L100–105, Y/N 정규화·빈칸→default). 모든 수치/플래그 열에 재사용.
- **`load_cases` 골격**(L111–174) — `DictReader`(utf-8-sig) + 빈 행 무시 + **거래 키 중복 차단**(L129–133) + fail-loud 검증 루프. **루프 구조·중복 차단·fail-loud 메커니즘은 G**, 컬럼 스키마·허용값·모순 가드(L153–162)는 S(§2①).
- **`cross_check` 자기검증**(L276–284) — `derive_violations`(테이블→위반) == `expected_from_flags`(플래그→의도)를 거래마다 대조, 불일치 시 즉시 `sys.exit`. **이것이 검증 엔진의 fail-loud 핵심**(생성기/입력 모순을 발행 전에 잡음). 두 함수의 내용은 S지만 **대조 메커니즘 자체는 절대 건드리지 않는다**.
- **엑셀 스타일·`style_header`·`write_table`**(L290–319) — `HDR`/`HDRFILL`/`GUIDE` 스타일, 헤더 채색, freeze. 그대로.
- **`build_reconcile`/`build_exception` 골격**(L337–369 / L372–412) — '안내' 시트(항목/설명 2열) + 데이터 시트 + 스타일·freeze·예시행. **골격은 G**, 안내 텍스트(`guide=[...]` L341–353 / L376–393)·컬럼 리스트는 S(§2⑤).
- **`recon_row`의 `answer` 분기 패턴**(L322–334) — `answer=False`면 식별칸만, `True`면 정답 채움. **한 함수로 빈양식·정답·given을 동시에 찍는** 비대칭 차단 패턴(L445–448). 칸 내용은 S, 분기 패턴은 G.
- **`main` 파이프라인**(L418–460) — 로드→합성→cross_check→정답 도출(L431–438)→엑셀 산출(L441–451)→요약 print. **흐름은 G**(파일명·시트명만 따라옴).
  > 📛 **학생 노출 네이밍**(`doc-templates.md §0.1`): 이 엔진이 찍는 학생 파일·폴더명은 한국어 역할명으로 둔다(`data/`→`데이터/`, `*_template.xlsx`→`*_제출용.xlsx`, `*_given.xlsx`→`*_참고용.xlsx`). 안내시트 텍스트·problem.md도 쉬운 말(임계 ±1·정규화·Set-F1 등 전문어 금지 — 판정 의미·유일 정답은 보존, 실데이터 컬럼명은 예외). 파일명을 정하면 그 이름을 build 출력 경로·docstring·안내시트·README/INPUT_GUIDE/evaluation·grade 사용예시까지 동기화하고, 재생성→자기채점 100점으로 확인.
- **`grade.py` 거의 전부** — `norm_str/int`(L29–43)·`load_sheet`(L59–71)·`grade_part1` 셀 Exact 루프(L85–108)·`grade_part2` 집합 F1(L124–142)·`main`/CLI/result.json(L156–191). **바꾸는 건 §2⑦의 `RECON_FIELDS`·`norm_vio` 별칭·`VIOLATIONS`·배점뿐**, 나머지는 채점 엔진으로 그대로 쓴다.

---

## 2. 과제마다 바꾸는 DOMAIN-SPECIFIC (체크리스트 ①~⑦)

순서대로 바꾼다. 각 항목은 **"어느 상수/함수의 어디를 어떻게"** 까지 짚는다.

### ① `cases.csv` 헤더 = 시나리오 스키마 (단일 진실 소스)
- **어디**: CSV 1행 헤더 + `load_cases`(L121–171)의 `dict(...)` 키 + fail-loud 검증(L127–162).
- **무엇**: 한 거래(행) = **키 컬럼 + 각 소스의 결함 주입 노브**. 3종 대사 헤더(L11–14 docstring):
  `case_id,발주번호,품목코드,품목명,발주수량,발주단가,입고수량차,청구단가차,금액오류,입고누락,계산서누락,품목명표기변형`
  - **거래 키** = `(발주번호+품목코드)`(L129). 한 키에 여러 라인아이템 가능.
  - **기준값** = `발주수량·발주단가`(다른 소스가 이로부터 파생).
  - **결함 노브** = `입고수량차`(int)·`청구단가차`(int)·`금액오류`(Y/N)·`입고누락`(Y/N)·`계산서누락`(Y/N).
  - **FP 함정 노브** = `품목명표기변형`(Y/N) — 표기만 다르고 위반 아님.
- **어떻게**: 새 테마의 **소스 개수·결함 종류**로 노브를 교체한다. `case_id`·키 컬럼은 **구조 컬럼**이라 유지. 결함 노브는 "각 위반유형 1개 ↔ 1개 플래그/수치"가 원칙(은행 대사 예시는 §끝).
- **fail-loud 추가**: 새 노브의 허용값(Y/N)·양의 정수 제약(L137–140)·**자기모순 가드**(L153–162: 행이 누락이면 그 소스의 수치 노브는 0이어야 함)를 새 결함 조합에도 복제한다. "누락=Y인데 그 소스의 수치차≠0"은 **무의미한 입력**이므로 차단해야 cross_check가 성립한다.

### ② 결함 주입 `build_tables` + 소스 헤더 `*_COLS`
- **어디**: `build_tables`(L194–230) · `vary_name`(L180–184) · `amount_offset`(L187–191) · `PO_COLS`/`GR_COLS`/`INV_COLS`(L294–296).
- **무엇**: cases.csv 노브를 읽어 **각 소스 테이블에 불일치·누락을 주입**한다. 각 소스 = `*_rows` 리스트 + `txns`의 필드. 핵심 규칙:
  - 파생값: `입고수량 = 발주수량 + 입고수량차`(L205), `청구단가 = 발주단가 + 청구단가차`(L213), `청구금액 = 청구수량×청구단가 + amount_offset`(L214).
  - 누락: `입고누락=Y → gr_rows에 행 안 넣음`(L202–207), `계산서누락=Y → inv_rows에 행 안 넣음`(L209–220).
  - **`amount_offset`(L187–191)**: 금액오류=Y면 `|x|>1`(경계 2 포함, L190), N이면 0 또는 +1(**허용오차 내 → 정상**, FP 함정 L191). 새 허용오차에 맞춰 경계값을 조정.
  - **`vary_name`(L180–184)**: 표기변형 FP 함정. 조인이 키(코드)로 되므로 표기 차이는 위반 아님.
- **어떻게**: 소스가 N개면 `*_rows` N개 + `txns` dict에 그 소스의 존재/값 필드. 새 결함 노브마다 주입 한 줄. **`txns` dict가 `derive_violations`의 입력**이므로, 규칙 도출에 필요한 모든 값을 여기 담는다(존재 플래그 `*_present` 포함).

### ③ rulebook 상수 + 위반유형 `VIOLATIONS`/`REASON`
- **어디**: `QTY_TOL`/`PRICE_TOL`/`AMOUNT_TOL`(L72–74) · `VIOLATIONS`(L77) · `REASON`(L78–84).
- **무엇**: 허용오차 상수(도메인 중립)와 위반유형 라벨(Set-F1 채점 키의 한 축). 3종 대사: 수량 정확일치(0)·단가 ±10·금액 ±1.
- **어떻게**: 새 감사 규칙의 임계값으로 상수를 바꾸고(은행 대사면 `DATE_TOL`(시점차 일수)·`FEE_TOL`(수수료 허용액) 등), `VIOLATIONS` 리스트를 새 위반유형으로 교체한다. **`VIOLATIONS`는 출력 정렬 순서 + grade의 허용유형 화이트리스트**(grade L25)와 1:1이어야 한다(§3 불변식). `REASON`은 사유 텍스트(채점 안 함, 참고용).

### ④ 정답 도출 `derive_violations` + 자기검증 `expected_from_flags`
- **어디**: `derive_violations`(L236–257) · `expected_from_flags`(L260–273). **이 한 쌍이 검증 엔진의 심장**.
- **무엇**:
  - **`derive_violations(txn)`**(L236–257): 합성된 테이블 값에 **rulebook을 다시 적용**해 위반 집합을 도출한다 — 누락(L239–242)·수량 불일치(L244–250, 존재하는 수량이 모두 같지 않으면)·단가(L252)·금액(L255). **cases.csv 플래그를 직접 읽지 않는다**(L44–46 철학) — 이게 독립검증·결정성의 근거.
  - **`expected_from_flags(c)`**(L260–273): cases.csv 플래그가 **의도한** 위반 집합(자기검증/fail-loud 전용). 플래그를 직접 읽는다.
- **어떻게**: 위반유형 1개 = 두 함수에 **각각 1블록**. (a) `derive_*`에 "테이블 값 → rulebook 적용 → 위반" 블록, (b) `expected_*`에 "플래그 → 의도" 블록. **둘이 모든 거래에서 일치해야** `cross_check`(L276–284)를 통과한다 — 불일치 = 생성기 버그 발행 차단. 부등호 방향·경계 포함 여부(`> PRICE_TOL` = 10정상/11위반)를 양쪽에 **똑같이** 반영하라(틀리면 cross_check가 잡는다).

### ⑤ Part1 조인 칸 `RECON_COLS`/`recon_row` + 안내 텍스트
- **어디**: `RECON_COLS`(L297–298) · `EXC_COLS`(L299) · `recon_row`(L322–334) · `build_reconcile` 안내(L341–353) · `build_exception` 안내(L376–393).
- **무엇**: Part1(대사정리표) 칸 = 각 소스에서 조인해 온 값. Part2(예외목록) 칸 = `(키들, 위반유형, 사유)`. 누락측 칸은 빈칸(L330–333).
- **어떻게**:
  - `RECON_COLS`를 새 소스의 조인 칸으로 교체하고, `recon_row`의 `answer=True` 분기에서 **누락=빈칸 규칙**을 유지(L331–333: `txn["gr_qty"] if txn["gr_present"] else ""`). `answer=False` 식별칸 수(L326)를 새 칸 수에 맞춰 조정.
  - **안내시트 고정 문구 3종**(반드시 유지):
    - **누락=빈칸**(L350): "장부에 행이 없으면 그 칸을 비운다. 0과 빈칸은 다르다".
    - **정상은 안 올림**(L389): "허용오차 안이면 위반 아님 — 올리면 오탐(FP)으로 감점".
    - **표기변형은 위반 아님**(L390): "장부마다 품목명 표기가 달라도(코드 같음) 위반 아님 — 조인은 코드로". (FP 함정이 없는 테마면 생략.)
  - **판정 규칙은 안내시트에 산다**(L382–388, problem.md 아님). 각 위반유형의 규칙을 한 줄씩 명시 — 경계 포함 여부까지("딱 10원은 정상, 11원부터 위반" L385).

### ⑥ 고정 기준일·시드
- **어디**: `ASSIGN_DATE`(L68) · `random.seed`(L69).
- **무엇/어떻게**: 새 과제도 **고정값**을 둔다(`datetime.now()` 금지). 날짜 파생 결함(시점차 대사)이면 `ASSIGN_DATE`를 기준일로 역산해 날짜를 심는다(매칭 가이드 §2.5 날짜 파생 스니펫과 동형). 시드는 임의 고정값 1개.

### ⑦ `grade.py` — `RECON_FIELDS` · `norm_vio` 별칭 · `VIOLATIONS` · 배점
- **어디**: `VIOLATIONS`(L25) · `norm_vio` 별칭(L46–56) · `RECON_FIELDS`(L75–78) · `score`(L147–153) · `valid_keys`(L169).
- **무엇/어떻게**:
  - **`RECON_FIELDS`**(L75–78): `{필드명: 정규화함수}` dict. **§2⑤ `RECON_COLS`의 채점 칸과 1:1로 맞춘다**(§3 불변식의 grade 쪽 끝). 수치 칸은 `norm_int`(빈칸≠0 보존, L35–43 → 누락 빈칸 vs 입고수량 0 구분 = G6).
  - **`norm_vio` 별칭**(L46–56): 새 위반유형의 동치 표기(예: "수량오류"≡"수량불일치")를 흡수하는 alias dict. 학생 표기 관용을 여기서 처리.
  - **`VIOLATIONS`**(grade L25): build의 `VIOLATIONS`와 같은 집합(허용유형 화이트리스트 — 허용 외 위반유형을 무결성 FP로 잡음, L135).
  - **배점**(`score` L147–153): Part1 셀 Exact 40 / Part2 Set-F1 50(검증이 핵심) / 무결성 10. 비율은 과제 가중치에 맞게 조정하되 **차원 분리(정확도/형식/무결성)는 유지**.
  - **무결성**: 유령 거래(미존재 키, L134)·허용 외 위반유형(L135)을 FP로 감점. `valid_keys`는 Part1 정답 키 집합(L169)이라 구조라 유지.

---

## 2.5 위반유형 타입 쿡북 (테마별 복제 패턴)

3종 대사는 일부 타입만 보여줘서, 새 테마(은행 대사·메타 감사 등)에서 자주 막힌다. `derive_violations`·`expected_from_flags`·`build_tables` 주입을 **타입별로** 이렇게 복제하라.

| 타입 | 예 | build_tables 주입 | derive(테이블→위반) | expected(플래그→의도) | rulebook 상수 |
|---|---|---|---|---|---|
| 정확일치(tol 0) | 수량 일치 | 발주±수량차 | 존재값 set이 1개 초과면 위반 | 수량차≠0이면 위반 | `QTY_TOL=0` |
| 임계 초과(>tol) | 단가 ±10 | 발주단가+단가차 | `abs(diff) > PRICE_TOL` | `abs(단가차) > 10` | `PRICE_TOL` |
| 계산 정합(±tol) | 금액=수량×단가 | `amount_offset` 주입 | `abs(금액 - 수량×단가) > AMOUNT_TOL` | `금액오류=='Y'` | `AMOUNT_TOL` |
| 존재/누락 | 입고·계산서 누락 | 누락=Y → 행 제외 | `not txn[*_present]` | `누락=='Y'` | — |
| **길이 위반(≤max)** | 메타 title ≤60자 | title 길이 주입 | `len(title) > TITLE_MAX` | `길이초과=='Y'` | `TITLE_MAX` |
| **중복(키 충돌)** | 메타 desc 중복 | 같은 desc 2행 심기 | 같은 desc가 2회 이상 출현하면 양쪽 위반 | `중복=='Y'` | — |
| **시점차(날짜)** | 은행 vs 장부 ±2일 | 장부일자=`ASSIGN_DATE-역산` | `abs((은행일-장부일).days) > DATE_TOL` | `시점차=='Y'` | `DATE_TOL` |
| **FP 함정(비위반)** | 표기변형·반올림 | `vary_name`·offset≤tol | 위반 **안** 잡힘(허용오차 내) | `expected`에도 **없음** | — |

**테마 전환에서 실제로 막히는 5함정 — 반드시 점검:**
1. **derive/expected 비대칭** — 한쪽만 고치면 `cross_check`가 막는다(이게 안전장치). **항상 두 함수를 같이 편집**하고, 부등호·경계 포함(`> tol` = tol정상/tol+1위반)을 양쪽 동일하게.
2. **누락 + 수치 노브 모순** — "행이 없는데 그 소스 수치차≠0"은 무의미. `load_cases` 모순 가드(L153–159)를 새 누락/수치 조합마다 복제하라.
3. **복수 위반 한 거래** — 한 거래가 수량+단가 동시 위반이면 `derive_violations`가 **집합**을 반환(L236 `set()`)하고 `main`이 위반마다 예외 행을 푼다(L435–436). 새 위반유형도 집합에 add만 하면 자동.
4. **FP 함정은 expected에도 없어야** — 표기변형·허용오차 내 반올림은 **위반이 아니므로** `derive`·`expected` 둘 다에서 안 잡혀야 한다. 잡히면 그건 진짜 위반 노브로 옮겨라.
5. **날짜 파생(시점차)** — 회원이 아니라 소스 행에 **날짜 컬럼**을 심는다. `ASSIGN_DATE` 고정이 결정성 보장. `derive`에서 `(d1-d2).days`로 환산해 `DATE_TOL` 비교, build에서 경계 일수를 `ASSIGN_DATE - timedelta(days=N)`로 역산(매칭 가이드 §2.5 스니펫 재사용).

> 핵심: 3종 대사 골격(`build_tables`·`derive_violations`·`cross_check` 구조)은 0줄 수정으로 재사용되지만, **새 위반유형은 위 패턴으로 derive/expected 한 쌍을 명시 복제**해야 한다.

---

## 3. 정답=규칙 불변식 (절대 깨지 않게)

> **위반유형 1개를 더하거나 바꾸면, 반드시 네 곳을 동반 수정한다. 하나라도 빠지면 채점이 조용히 틀린다.**

| # | 파일·함수 | 무엇을 |
|---|---|---|
| 1 | `cases.csv` 헤더 + `load_cases`(L121–171) | 결함 노브 = CSV 컬럼 (§2①) |
| 2 | `build_dataset.py` — **주입**(`build_tables` L194–230) + **도출**(`derive_violations` L236–257) + **의도**(`expected_from_flags` L260–273) + **라벨**(`VIOLATIONS`/`REASON` L77–84) | 위반유형 = 주입 + 규칙도출 + 플래그의도 + 라벨 (§2②③④) |
| 3 | `build_dataset.py` — 출력(`RECON_COLS`/`recon_row` L297–334, `EXC_COLS` L299) | 소스값 = 조인 칸 + 위반 = 예외 칸 (§2⑤) |
| 4 | `grade.py` — `RECON_FIELDS`(L75–78) + `VIOLATIONS`(L25) + `norm_vio`(L46–56) | 조인 칸 = 채점 필드 + 위반유형 화이트리스트 + 동치 (§2⑦) |

**왜**: 결함 노브만 추가하고 `derive_violations`에 규칙을 안 넣으면 그 위반은 정답에 안 잡히고(변별 0), `derive`만 넣고 `expected_from_flags`를 안 맞추면 `cross_check`가 막거나(발행 차단) — 더 나쁘게 둘 다 같은 방향으로 틀리면 자기충족 버그가 통과한다(§5 독립검증이 이걸 잡음). `VIOLATIONS` 화이트리스트를 grade와 안 맞추면 정답 위반유형이 무결성 FP로 오인된다. 넷이 한 몸이다.

> **derive ↔ expected 이중 정의가 핵심**: 매칭 엔진은 정답을 `member_passes` 한 곳에서 계산하지만, 검증 엔진은 **규칙 도출(`derive`)과 플래그 의도(`expected`)를 따로 정의하고 `cross_check`로 대조**한다 — 이 이중 정의 자체가 "정답이 곧 규칙"을 강제하는 장치다. 플래그를 직접 읽어 정답을 만들면(=expected만 쓰고 derive를 건너뛰면) 독립검증·결정성 근거가 무너진다(L44–46).

---

## 4. ★ 분리형(decouple) 적용법 (기본값)

> **목표**: Part1(대사표 조인) 실패가 Part2(위반 판정)로 전이되지 않게 한다. 학생이 장부 조인을 틀려도 Part2는 **올바른 정답 대사표**를 입력으로 받아 위반 판정 역량만으로 채점되게 한다. (SKILL.md 기본값 = 분리형 / 인터뷰 Q10 기본값과 일치.)

**이 엔진은 분리형이 기본 내장**돼 있다. `main`이 `recon_row(t, answer=True)`를 재사용해 **Part2 입력용 정답 대사표**를 따로 저장한다:

```python
# main() L447–448 — 이미 구현됨
# 분리형: Part2 입력용 정답 대사표(올바른 조인) = Part1 정답과 동일 내용
build_reconcile(DATA / "reconcile_table_given.xlsx", txns, answer=True)
```

- `data/reconcile_table_given.xlsx`(★제공된 정답 대사표) = Part1 정답과 동일 내용. `build_exception` 안내(L379)가 "이걸 입력으로 쓰라 — 1단계 조인을 틀려도 2단계는 영향 없음"을 명시.
- 빈 양식(`reconcile_table_template.xlsx` L445)은 Part1 제출용으로 남고, `given`은 Part2 입력 전용.
- **채점은 독립**: `grade.py`가 Part1(`reconcile_table_answer.xlsx`)·Part2(`exception_answer.xlsx`)를 **따로 채점**(L164–167)하므로, 분리는 학생 입력 경로만 바꾸지 정답 계산을 바꾸지 않는다.

> 결합형(가혹)을 원하면(Q10 override) `reconcile_table_given.xlsx` 생성(L448)을 빼고 `build_exception` 안내를 "Part1에서 만든 대사표를 쓰라"로 바꾼다.

---

## 5. 재생성 · 자기채점 · 독립검증 루프 (바꾼 뒤 반드시)

위반유형/소스를 바꿨으면 아래를 순서대로 돌려 닫는다. 하나라도 실패하면 발행 금지(S10 게이트).

```bash
# 1) 재생성 — cases.csv(새 결함 노브) → 소스·양식·정답키 산출.
#    cross_check가 derive==expected를 검사하므로, 통과 못 하면 여기서 중단된다(1차 자기검증).
python eval/answer_key/build_dataset.py
#   콘솔: 거래 N건 / 소스 행수 / 위반유형별 건수 / 정상 거래 수 (자기검증 통과)

# 2) 자기채점 — 정답키로 정답 양식을 채워 채점하면 100점이어야 한다(정합성 2차 확인)
python eval/grade.py \
  --part1 eval/answer_key/reconcile_table_answer.xlsx \
  --part2 eval/answer_key/exception_answer.xlsx \
  --answer-dir eval/answer_key
#   → 총점(100) 100.0 / Part1 셀정확도 100% / Part2 F1 100% 가 아니면
#     RECON_FIELDS↔RECON_COLS 불일치(§3-4) 또는 norm 함수 오배정(§2⑦)을 의심.

# 3) 독립 재계산 — build_dataset 로직을 '재사용하지 않고' cases.csv+rulebook만으로
#    위반을 다시 계산해 exception_answer.xlsx와 집합 단위 대조. 불일치 = 발행 차단.
python verify/independent_recompute.py         # verify/ 참조
```

- **cross_check가 막으면**(1단계 중단): `derive_violations`/`expected_from_flags` 비대칭(§2④) — 부등호 방향·경계 포함·누락 처리 중 하나가 두 함수에서 다르다.
- **자기채점 100이 안 나오면**: 거의 항상 **§3 불변식 누락**(`RECON_FIELDS`에 새 칸을 안 넣음, 또는 `VIOLATIONS` 화이트리스트 불일치, 또는 `norm_vio` 별칭 누락).
- **자기채점 100인데 독립 재계산이 불일치하면**: 생성·채점 양쪽에 **같은 버그**가 있는 것(예: `derive`와 `expected`에 동일한 부등호 오류 — `cross_check`는 둘이 *서로* 같으면 통과하므로 이걸 못 잡는다). **독립 재계산이 이 자기충족 허점을 잡는 게이트**다 — 매칭 엔진보다 검증 엔진에서 더 중요하다(derive/expected 이중 정의가 둘 다 틀릴 수 있으므로).
- 마지막으로 `verify/adversarial_prompts.md`로 적대 리뷰(정상 거래를 예외에 올렸나? 허용오차 경계가 틀렸나? 표기변형을 위반으로 잡았나? 누락+수치 모순 가드 빠졌나? `VIOLATIONS` 화이트리스트 누락? seed 누락?)를 돌리고, `references/checklist.md` G1~G10 발행 게이트를 통과시킨다.

---

## 6. 새 대사·감사 테마로 적응 — 워크스루 2종

### 워크스루 A — 은행 거래 대사 (`GEN-L2-X2`, 두 소스 · 날짜 파생)
"은행 거래내역 ↔ 장부 대사해서 미매칭 골라줘". 소스 2개(`bank` / `ledger`), 키 = `(거래일자 근방 + 금액)` 또는 `거래번호`.

- **① cases.csv**: `case_id,거래번호,적요,장부금액,장부일자차,은행금액차,시점차,수수료차,은행누락,장부누락` — 결함 노브를 은행 대사용으로 교체.
- **② build_tables**: `bank_rows`/`ledger_rows` 2개. 은행금액 = 장부금액+은행금액차, 은행일자 = `ASSIGN_DATE - timedelta(시점차)`(날짜 파생, §2.5 스니펫). 누락=Y → 행 제외.
- **③ rulebook**: `AMOUNT_TOL`(금액 정확일치 0)·`DATE_TOL`(시점차 허용 일수 2)·`FEE_TOL`(수수료 허용액). `VIOLATIONS = ["금액불일치","시점차이","수수료미반영","은행미매칭","장부미매칭"]`.
- **④ derive/expected**: 금액 `abs(diff)>0`·시점 `abs((은행일-장부일).days)>DATE_TOL`·수수료 임계·누락. **양쪽 한 쌍씩** 복제, cross_check로 검증.
- **⑤ 출력**: `RECON_COLS = [거래번호,장부금액,장부일자,은행금액,은행일자]`. 안내에 "시점차 ±2일은 정상, 3일부터 위반".
- **⑦ grade**: `RECON_FIELDS`에 금액/일자 칸, `norm_vio`에 동치 표기. 날짜 칸은 `norm_str`(또는 날짜 정규화).
- **공유 그대로**: Set-F1·무결성·분리형·결정성·안내 골격.

### 워크스루 B — 페이지 메타데이터 감사 (`MKT-L1-X4` / `M11`, 단일 소스 · 규칙 검사)
"페이지 메타데이터 길이·중복·누락 감사". 소스 1개(`crawl`: URL·title·desc), 키 = `URL`. **장부 대사가 아니라 단일 소스 규칙 검사**지만, "데이터+규칙→위반"이라 같은 엔진.

- **① cases.csv**: `case_id,URL,title,desc,title길이초과,desc길이초과,title누락,desc누락,desc중복그룹` — 결함 노브.
- **② build_tables**: `crawl_rows` 1개. 길이초과=Y → title을 `TITLE_MAX+n`자로 생성, 누락=Y → 셀 빈값, 중복그룹 같은 행끼리 desc 동일하게 심기.
- **③ rulebook**: `TITLE_MAX`(60)·`DESC_MIN`/`DESC_MAX`. `VIOLATIONS = ["제목길이초과","설명길이위반","제목누락","설명누락","설명중복"]`.
- **④ derive/expected**: `len(title)>TITLE_MAX`·빈값·**중복은 같은 desc가 2회+ 출현하면 양쪽 위반**(§2.5 중복 타입). cross_check 동일.
- **⑤ 출력**: Part1 대사표 대신 **추출표**(`RECON_COLS = [URL,title길이,desc길이]`) — 단일 소스라 조인이 아니라 파생 추출. Part2 예외목록은 동일(`[URL,위반유형,사유]`).
- **⑦ grade**: `RECON_FIELDS`에 길이 칸, `VIOLATIONS` 화이트리스트 교체.
- **주의**: 소스가 1개라 누락 위반의 "행 제외"가 아니라 "**셀 빈값**"이 누락이다 — `build_tables`·`derive`의 누락 판정을 행존재→셀존재로 바꾼다. 표기변형 FP 함정은 없으니 그 안내 문구(L390)·`vary_name` 제거.

> 두 워크스루 모두 **§1 GENERIC은 0줄 수정**, §2 체크리스트 ①~⑦만 바꾼다. 핵심 불변식(§3): `derive`·`expected`·`build_tables`·`RECON_FIELDS` 네 곳 동반 + `cross_check` 통과 + 독립 재계산 일치.

---

## 부록 — 적응 빠른 점검표 (한 위반유형 추가/교체 시)

- [ ] ① cases.csv 헤더에 결함 노브 + `load_cases` dict 키 + fail-loud 가드(누락↔수치 모순 포함)
- [ ] ② `build_tables`에 주입 한 줄 + `txns` dict에 필요한 값 + 소스 헤더 `*_COLS`
- [ ] ③ rulebook 상수 + `VIOLATIONS`/`REASON` 라벨
- [ ] ④ `derive_violations`에 규칙도출 1블록 + `expected_from_flags`에 플래그의도 1블록 (부등호·경계 양쪽 동일)
- [ ] ⑤ `RECON_COLS`/`recon_row` 조인 칸 + 안내 텍스트 (+ 고정 3문구: 누락=빈칸·정상안올림·표기변형비위반)
- [ ] ⑥ `ASSIGN_DATE`/`seed` 고정 (날짜 파생이면 역산)
- [ ] ⑦ `grade.py` `RECON_FIELDS`+norm + `VIOLATIONS` 화이트리스트 + `norm_vio` 별칭 + 배점 점검
- [ ] §3 불변식: cases·build(주입·derive·expected·라벨)·출력·grade(RECON_FIELDS) **네 곳 동반** 확인
- [ ] §4 분리형: `reconcile_table_given.xlsx` 생성 유지 (기본값)
- [ ] §5 루프: 재생성(cross_check 통과) → 자기채점 100 → 독립 재계산 일치 → 적대 리뷰 → 체크리스트
</content>
</invoke>
