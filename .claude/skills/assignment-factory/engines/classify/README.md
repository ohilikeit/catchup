# Classify Engine — 분류(유형·감성) 과제 생성기

`assignment-factory`의 **다섯 번째 검증된 엔진**. `problems/marketing/3.voc_classification`(VOC 유형·감성 2축 분류)에서 추출한, **분류** 아키타입 전용 데이터셋·정답·채점 도구다. `_6` 카탈로그의 텍스트 분류·라벨링 계열(VOC/문의 분류, 리뷰 감성 분류 등)을 같은 엔진으로 찍어낸다. 채점유형 = **다클래스 macro-F1 + 혼동행렬**.

대상 아키타입: **텍스트 → 범주 라벨**. 판별 기준이 "이게 뭐냐(정답 모호)"라 결정성과 충돌한다 → **모호함을 규칙으로 결정화**한다: 자유 판단이 아니라 **우선순위 규칙북**(키워드 → 라벨, 위에서부터 첫 매치)으로 모든 텍스트가 **유일 라벨**로 떨어진다. 정답은 생성된 text에 규칙북을 **재적용**해 도출한다(시나리오 의도 라벨을 직접 베끼지 않는다 — 규칙 재적용으로 도출해야 결정성/독립검증 성립). 랭킹·퍼널은 이 엔진 밖이다(`references/archetypes.md`).

## 다른 엔진과의 관계 (무엇을 재사용했나)

- **재사용(그대로)**: 결정성 3종(`ASSIGN_DATE`·`random.seed`·전역 누적상태 없음), 경로 스캐폴드(`ROOT=parents[2]`), 엑셀 스타일·`style_header`·freeze, 안내시트 골격(항목/설명 2열 + 규칙 명문화), 빈칸≠라벨 보존 정규화, 차원 분리 배점, 무결성 센티넬(라벨집합 외/유령 ID), `build_submission(answer=False/True)` 한 함수로 빈양식·정답 동시 산출, **cross_check 자기검증**(`derive` == `expected`, audit 엔진과 동형).
- **신규(분류 고유)**:
  - **우선순위 규칙북** `TYPE_ORDER`/`TYPE_KEYWORDS`(위에서부터 첫 매치) + `SENTI_NEG`/`SENTI_POS`(부정>긍정>중립).
  - **텍스트 합성** `build_text`(템플릿 + 유형/감성 어구 슬롯 → 자연스러운 한국어 문장). 충돌·경계·판별불가 케이스를 어구 조합으로 주입.
  - **규칙 재적용 정답 도출** `derive_labels`(text → (유형,감성)). 의도 라벨 직접 안 읽음.
  - **어휘 분리 단언** `_assert_vocab_disjoint`(유형 키워드 ∩ 감성 키워드 = ∅ → 두 축 독립 도출 보장).
- **채점 프리미티브 신규**: audit/매칭의 Set-F1이 아니라 **다클래스 macro-F1**(`grade_axis`) + **혼동행렬**(`fmt_confusion`). 단순 정확도가 아니라 macro라 '다수 클래스로 다 찍기'를 처벌한다(소수 클래스 F1이 0이면 평균 급락).

## 구성 파일

| 파일 | 역할 |
|---|---|
| `build_dataset.py` | **단일 입력 items.csv → voc_데이터 + 제출양식 + 정답키** 생성기. |
| `grade.py` | **채점기**: 유형 macro-F1 + 감성 macro-F1 + 혼동행렬 + 무결성. |
| `items.example.csv` | 입력 CSV 예시(33항목, 6유형·3감성·충돌·경계·판별불가 전부 커버). 새 과제는 이걸 베껴 도메인 데이터로 채운다. |

## 어떻게 도는가 (파이프라인)

```
items.csv (단일 진실 소스 — 시나리오 명세)
   │  load_items()  ── fail-loud(item_id 중복·허용 외 라벨/충돌/경계값·
   │                   유형충돌의 충돌상대 우선순위 역전·감성충돌≠부정·판별불가≠기타/중립 모순 즉시 중단)
   ▼
build_text()  ── 템플릿+어구 슬롯으로 자연어 문장 합성(충돌·경계·판별불가 케이스 주입)
   ▼
cross_check()  ── 규칙도출(derive_labels) == 의도라벨(유형/감성) 자기검증 (불일치=생성기 버그 → 중단)
   ▼
derive_labels(text)  ── 규칙북 **재적용**(유형 우선순위 첫 매치 / 감성 부정>긍정>중립) → 정답 (의도 라벨 직접 안 읽음)
   ▼
엑셀 산출:
   data/voc_데이터.xlsx                        학생 입력(item_id, text — 라벨 없음)
   data/classification_template.xlsx           제출 양식(빈 라벨 + '안내')
   eval/answer_key/classification_answer.xlsx  정답(규칙 재적용 도출 라벨)
```

## 규칙북 (rulebook — 안내시트/INPUT_GUIDE에 명시)

**문의유형(우선순위 순, 위에서부터 첫 매치)** — 한 텍스트에 여러 키워드가 걸리면 번호가 작은(우선순위 높은) 라벨:

| 우선 | 라벨 | 트리거 키워드 |
|---|---|---|
| 1 | 환불취소 | 환불 · 취소 · 반품 · 돈 돌려 · 결제 취소 |
| 2 | 배송문제 | 배송 · 택배 · 도착 · 안 와 · 발송 |
| 3 | 제품불량 | 불량 · 고장 · 깨져 · 작동이 안 · 하자 · 망가 |
| 4 | 사용법문의 | 어떻게 쓰 · 사용법 · 사용 방법 · 설정 · 연결하는 방법 · 방법 문의/알려 |
| 5 | 칭찬감사 | 친절 · 칭찬 · 수고 · 고맙 · 고마웠 |
| 6 | 기타 | (위 어디에도 안 걸리면) |

**감성(부정 > 긍정 > 중립)** — 부정어가 하나라도 있으면 부정, 없고 긍정어가 있으면 긍정, 둘 다 없으면 중립.
- 부정어: 화가 · 실망 · 최악 · 불편 · 짜증 · 별로 · 엉망
- 긍정어: 좋아/좋네/좋습니다 · 만족 · 최고 · 훌륭 · 마음에 · 감동

**판별불가**: 규칙 키워드가 하나도 안 걸리면 무리하게 추측하지 말고 유형=기타·감성=중립. **유형≠감성**: 두 축은 별개(칭찬이라고 무조건 긍정 아님 — 감성어만 본다).

## 결정성 3종 (반드시 유지 — `references/checklist.md` G10)

1. **고정 기준일** `ASSIGN_DATE = date(2026,6,28)`(참고 상수, 채점 미사용). `datetime.now()`/`today()` 금지.
2. **고정 시드** `random.seed(20260628)`. 같은 items.csv = 같은 텍스트·정답. (어구 선택은 `_seq` 기반 결정적이라 사실상 시드 비의존이지만 계약상 유지.)
3. **단일 입력 재현** items.csv만 바꿔 재실행하면 텍스트·양식·정답이 항상 정합 재생성. (전역 누적 상태 없음.)

## 채점 (grade.py)

- **문의유형 macro-F1 (45점)** — 6클래스. 클래스별 F1을 (gold에 등장하는) 클래스에 대해 단순 평균. 혼동행렬 출력.
- **감성 macro-F1 (45점)** — 3클래스. 동일 프리미티브.
- **무결성 (10점)** — 라벨집합 외 값/빈칸 + 유령 item_id를 위반으로 감점(`max(0, 10 - 위반*0.5)`).
- **정규화 관용** — `norm_type`/`norm_senti`가 동의어·공백을 흡수(환불≡환불취소, positive≡긍정 등). 라벨집합 외/빈칸은 `(무효)` 센티넬로 오답 처리.

> **분리형(decouple) N/A**: 2축 분류는 한 시트에 유형·감성을 동시 산출하는 **단일 산출**이라 Part 분리가 불필요하다(audit/매칭의 Part1→Part2 전이 차단이 여기선 무의미). 한 제출 파일(`classification_template.xlsx`, '분류' 시트)에 두 칸을 채운다.

## 실행 커맨드

과제 디렉터리(`problems/<직무>/<n>.<slug>/`)에 `eval/answer_key/build_dataset.py`·`eval/grade.py`로 배치한 뒤:

```bash
# 1) 생성: items.csv → voc_데이터 + 양식 + 정답키
python eval/answer_key/build_dataset.py
# 콘솔: 항목 N건 / 유형·감성 분포 / 충돌·경계·판별불가 건수 (cross_check 통과)

# 2) 자기채점(정답키 자기검증 — 100점 기대)
python eval/grade.py \
  --submission eval/answer_key/classification_answer.xlsx \
  --answer-dir eval/answer_key
```

## 새 분류 도메인으로 적응 (도메인 중립화 지점)

라벨 집합·키워드는 과제마다 바뀐다. **분류 아키타입의 제너릭 골격**은 ① 우선순위 규칙북(`TYPE_ORDER`/`TYPE_KEYWORDS` + 감성), ② 텍스트 합성(`TYPE_PHRASES`/`SENTI_PHRASES`/`TEMPLATES`), ③ 규칙 재적용 도출(`derive_labels`)·의도(`expected_from_flags`)·자기검증(`cross_check`), ④ macro-F1 채점(`grade_axis`)이다. 새 도메인(예: 티켓 우선순위 분류, 리뷰 토픽 분류)은:

1. `TYPE_ORDER`/`TYPE_KEYWORDS`(우선순위 + 키워드)와 감성 축을 새 라벨로 교체. **어휘는 두 축 간 disjoint**(`_assert_vocab_disjoint`가 강제).
2. `TYPE_PHRASES`/`SENTI_PHRASES`/`NEUTRAL_FILLER`/`TEMPLATES`를 새 도메인 자연어로.
3. `grade.py`의 `TYPE_LABELS`/`SENTI_LABELS`·`TYPE_ALIAS`/`SENTI_ALIAS`·배점을 새 라벨로.
4. items.csv 분포에서 **모든 클래스 support>0** 보장(macro-F1 분모).

**불변식**: `derive_labels`(text→라벨)와 `expected_from_flags`(의도 라벨)가 항상 일치해야 하며(`cross_check` 강제), 정답은 **반드시 text에서 규칙 재적용으로 도출**(의도 라벨 직접 읽기 금지)한다 — 이것이 독립 검증·결정성의 근거다. 단일 축을 더하거나 라벨을 바꾸면 **규칙북·합성어구·derive·grade 라벨집합 네 곳을 동반 수정**한다(빠지면 cross_check 또는 macro-F1이 조용히 틀린다).
