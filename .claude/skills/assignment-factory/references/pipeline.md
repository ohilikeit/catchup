# 제작 파이프라인 (S1~S10)

**목적**: 과제 패키지 한 벌을 단계별 입력/산출/통과 게이트로 진행한다. 표기 — **U**=사용자 확인(인터뷰) · **W**=웹 리서치 · **G**=생성 · **A**=적대 검증. 각 단계는 어느 참조 파일을 쓰는지 "참조" 칸에 명시한다.

## 단계표

| 단계 | 입력 | 산출 | 게이트(통과조건) | 마커 | 참조 |
|---|---|---|---|---|---|
| **S1 스코핑/인터뷰** | 사용자 의도 | Q1~Q11 답 | Q1·Q2·Q6 필수 채움, 아키타입 식별 | **U** AskUserQuestion | `interview.md` |
| **S1.5 아키타입 라우팅** | Q2/Q4 | 아키타입 판정 → 매칭이면 계속 / 비매칭이면 "미지원 + 수동 설계 가이드" 반환 후 종료 | Q2/Q4가 매칭이 아니면 즉시 분기(정직하게 미지원 선언) | **U/A** | `archetypes.md` |
| **S2 도메인 그라운딩** | 테마·실도메인 | 실제 정책/엔티티 사실, 실포스터 소싱 가이드(PDF/PNG), 회사색 제거(`_6 §0`) | 실데이터 ≥N건, 산업범용 업무형태로 환원 | **W** WebSearch/scrape | `multimodal-sourcing.md` (포스터 소싱·운영자 배치 체크리스트) |
| **S3 매칭 모델 설계** | Q6 축 | 축 목록 + **축↔컬럼 1:1 표** | 모든 축에 데이터 컬럼 짝 존재(교집합 불변식) | **U** 검토 | `interview.md`(Q6), `matching-engine-guide.md`(AXES 스펙) |
| **S4 단일입력 설계** | 축·결함 | `<input>.csv` 헤더 + `INPUT_GUIDE.md` + 검증규칙 | 기준은 학생 발명X·제공O(G2); 빈칸=무관 닫힘(G6); fail-loud | 템플릿 | `doc-templates.md`(INPUT_GUIDE 골격), `matching-engine-guide.md` |
| **S5 생성 엔진** | csv | `build_dataset.py`(경계회원 자동삽입 + 양식 + 정답키) | seed·ASSIGN_DATE 고정(G10); clear+reseed 재호출 안전 | **G** 제너릭 엔진 | `engines/matching/`, `matching-engine-guide.md`(축 카탈로그·합성 풀 3군데 동반 수정) |
| **S6 결함 주입** | Q7 결함 | 경계 엔티티·표기변형·판별불가 플래그 | 모든 케이스가 명시규칙→단일 정답(모호 케이스 제외) | **G** 엔진 내장 | `engines/matching/`, `checklist.md`(B1~B8) |
| **S7 채점기** | 스키마 | `grade.py`(Exact/Set F1 + 무결성) | 스크립트 작동(G7); 차원분리(G8); 정규화 관용(G9) | **G** | `engines/matching/grade.py`, `matching-engine-guide.md`(`P1_FIELDS`·배점·matchable 적응) |
| **S8 eval 4문서** | 위 전부 | README/intention/evaluation/INPUT_GUIDE | 골격 충족 | **G** writer | `doc-templates.md`(README 5구성 / intention / evaluation / INPUT_GUIDE 골격) |
| **S9 problem.md** | 시나리오 | 비개발자 업무 브리프 | 5규칙; 정답 누설 0; 판정규칙은 안내시트로 이동 | **G** | `doc-templates.md`(비개발자 problem.md 5규칙) |
| **S10 적대적 검증** | 정답키 | 독립 재계산 대조 + 적대 리뷰 보고 | 빌드코드 **미재사용** 재계산 일치 + 리뷰 결함 0 + 발행 게이트 통과 | **A** 별도 컨텍스트/Codex | `verify/independent_recompute.md`, `verify/adversarial_prompts.md`, `checklist.md` |

## 마커별 진입 위치 요약

- **U**(사용자 확인) = S1 · S1.5 · S3
- **W**(웹 리서치) = S2
- **G**(생성) = S5 · S7 · S8 · S9
- **A**(적대 검증) = S1.5(미지원 정직 선언) · S10

## 단계별 참조 파일 빠른 색인

| 참조 파일 | 쓰는 단계 |
|---|---|
| `interview.md` | S1, S3(Q6) |
| `archetypes.md` | S1.5 |
| `multimodal-sourcing.md` | S2 |
| `matching-engine-guide.md` | S3·S4·S5·S7 (AXES 축 카탈로그·합성 풀·정규화·안내시트 동반 수정 절차) |
| `doc-templates.md` | S4(INPUT_GUIDE)·S8·S9 |
| `engines/matching/` | S5·S6·S7 (검증된 build_dataset.py·grade.py·예시 입력 csv) |
| `checklist.md` | S6(B1~B8)·S10 발행 게이트(G1~G10 + 불변식 + 이중채점) |
| `verify/independent_recompute.md`, `verify/adversarial_prompts.md` | S10 |

## 반복 루프 (이게 직선이 아니다)

S1→S10은 한 번에 끝나지 않는다. **사용자 피드백으로 여러 단계를 다회 되돈다.** youth_policy에서 실제로 일어난 루프:

| 피드백 | 되돈 단계 |
|---|---|
| 합성 데이터 → **실데이터 교체**(실제 정책 사실로 그라운딩) | S2 → S4 → S5 |
| **축 추가**(연소득·기업규모) | S3 → S4(csv 헤더) → S5(`member_passes`·`plant_boundaries`) → S7(`P1_FIELDS`) — **세 곳 동반 수정** |
| **규모 조정**(회원 수 변경, 800 기준 유동) | S5(`target_count`) |
| **함정 제거**(마감 2주 날짜필터 = `datetime.now()` 의존, G10 모순 → 폐기) | S6 → S8·S9 6문서 일관 선언("신청 날짜는 보지 않는다 — 자격만 본다") |
| **problem.md 슬림화**(판정규칙을 안내시트로 이전, 정답 누설 제거) | S9 |

원칙: 축 하나를 건드리면 교집합 불변식 때문에 **S3·S4·S5·S7이 같이 움직인다**. 결함 하나를 버리면 **S6과 eval/problem 문서(S8·S9)가 같이 갱신**된다. 매 루프 끝에는 S10 검증을 다시 통과해야 발행된다.
