# 문제 유형 뱅크

바이브코딩·AI 역량 평가용 **결정성 채점 과제**를 출제하기 위한 시드 인덱스 폴더입니다. 일반사무(GEN)·마케팅(MKT) 직무에서 실제로 반복되는 "엑셀·PDF·이미지 더미를 받아 규칙대로 가공하는" 업무를 20개 과제 후보로 추려, 각 항목을 아래 6종 택소노미로 1차(primary)·필요시 2차(secondary) 태깅했습니다. 이 폴더는 노션 DB import용 인덱스(`index.csv`)와 그 범례(이 문서)를 담으며, 각 행의 `파일` 컬럼이 가리키는 `<id>-<slug>.md`가 개별 과제 상세 명세가 들어갈 자리입니다.

## 문제 유형 택소노미(6종) — 각 항목에 primary 1개(+필요시 secondary) 태깅

| 코드 | 유형 | 입력→출력 | 판별 기준(한 줄) |
|---|---|---|---|
| ① | 추출/파싱 | 비정형(PDF·이미지) → 표 | "구조 없던 걸 표로 만든다" |
| ② | 취합/통합 | 정형 다수 → 정형 하나 | "행을 보존하며 여러 파일을 합친다" |
| ③ | 집계/분석 | 정형 → 요약·지표 | "행을 줄여 수치·인사이트로" |
| ④ | 분류 | 텍스트 → 범주 라벨 | "이게 뭐냐 (정답이 모호)" |
| ⑤ | 초안 작성 | 자료 → 새 산문 | "없던 글을 쓴다" |
| ⑥ | 검증/검수 | 데이터+규칙 → 위반 판정 | "규칙에 맞냐 (정답이 규칙)" |

## 마스터 표 (20개)

| 번호 | 직무 | 유형 | 업무형태 | 판별 | 난이도 | 파일 |
|---|---|---|---|---|---|---|
| GEN-01 | GEN | ②취합/통합 (+③집계/분석) | G7 다중 견적 비교 → 최저가/조건 선정 | 양식이 다른 여러 견적을 행을 보존하며 한 표로 합쳤는가 | 1 | [GEN-01-vendor-quote-consolidation.md](GEN-01-vendor-quote-consolidation.md) |
| GEN-02 | GEN | ⑤초안 작성 | G4 템플릿 문서 일괄 생성(mail-merge) | 명단의 각 행을 템플릿에 부어 없던 문서를 새로 찍어냈는가 | 1 | [GEN-02-bulk-certificate-merge.md](GEN-02-bulk-certificate-merge.md) |
| GEN-03 | GEN | ②취합/통합 | G12 다채널 주문/유입 데이터 표준화 | 채널마다 다른 주문 양식을 행 보존하며 하나로 합쳤는가 | 1 | [GEN-03-order-intake-standardize.md](GEN-03-order-intake-standardize.md) |
| GEN-04 | GEN | ⑥검증/검수 (+②취합/통합) | G1 두 대장 대사 — 3-way matching(발주·입고·인보이스) | 세 출처를 키로 맞춰 규칙(허용오차)에 어긋난 건만 골라냈는가 | 2 | [GEN-04-three-way-match.md](GEN-04-three-way-match.md) |
| GEN-05 | GEN | ⑥검증/검수 | G1 두 대장 대사 — 은행 거래 vs 장부 | 양쪽을 키로 대조해 규칙상 안 맞는 행만 분리했는가 | 2 | [GEN-05-bank-ledger-reconcile.md](GEN-05-bank-ledger-reconcile.md) |
| GEN-06 | GEN | ④분류 | G2/G9 비정형 입력 → 유형·감성 분류 | 자유 텍스트를 정해진 범주 라벨로 판정했는가(애매하면 보류) | 2 | [GEN-06-voc-classification.md](GEN-06-voc-classification.md) |
| GEN-07 | GEN | ①추출/파싱 (+⑥검증/검수) | G11 계약·문서 등록 → 기한/만료 추적 | 구조 없던 계약서에서 기한·금액을 표로 뽑아냈는가 | 2 | [GEN-07-contract-expiry-tracking.md](GEN-07-contract-expiry-tracking.md) |
| GEN-08 | GEN | ③집계/분석 (+②취합/통합) | G3 다출처 종합 → 경향 집계(지점 운영 대시보드) | 여러 행을 줄여 수치·추세 인사이트로 요약했는가 | 3 | [GEN-08-branch-ops-dashboard.md](GEN-08-branch-ops-dashboard.md) |
| GEN-09 | GEN | ③집계/분석 (+⑥검증/검수) | G6 근태·시간 데이터 → 급여/정산 산출 | 타임스탬프에 규칙을 적용해 금액 수치로 산출했는가 | 3 | [GEN-09-payroll-recompute.md](GEN-09-payroll-recompute.md) |
| GEN-10 | GEN | ①추출/파싱 (+⑥검증/검수) | G10 OCR 증빙 취합 + 정책 검증 | 영수증 이미지에서 항목을 표로 추출했는가 | 3 | [GEN-10-expense-ocr-audit.md](GEN-10-expense-ocr-audit.md) |
| MKT-01 | MKT | ②취합/통합 (+③집계/분석) | M5 다출처 리스트 정규화·중복제거(키워드) | 여러 export를 행 보존해 합치고 중복만 정리했는가 | 1 | [MKT-01-keyword-dedup-priority.md](MKT-01-keyword-dedup-priority.md) |
| MKT-02 | MKT | ③집계/분석 | M(CRM) 이메일 캠페인 성과 비교 | 원지표 행을 비율 지표로 줄여 요약했는가 | 1 | [MKT-02-email-campaign-rates.md](MKT-02-email-campaign-rates.md) |
| MKT-03 | MKT | ③집계/분석 | M(이커머스) 상품 성과 랭킹(AOV·전환) | 로그를 상품 단위 수치로 집계해 순위로 줄였는가 | 1 | [MKT-03-product-performance-rank.md](MKT-03-product-performance-rank.md) |
| MKT-04 | MKT | ⑥검증/검수 | M11 메타데이터/규칙 감사(길이·중복·누락) | 정해진 규칙에 어긋난 행만 위반으로 판정했는가 | 1 | [MKT-04-meta-audit.md](MKT-04-meta-audit.md) |
| MKT-05 | MKT | ④분류 (+③집계/분석) | M8 세그먼트 분류(규칙 기반) | 고객을 규칙 기준 범주로 라벨링했는가 | 2 | [MKT-05-lifecycle-segmentation.md](MKT-05-lifecycle-segmentation.md) |
| MKT-06 | MKT | ④분류 (+③집계/분석) | M10 비정형 멘션 → 감성·주제 분류 + SoV | 자유 멘션 텍스트를 감성·주제 범주로 판정했는가 | 2 | [MKT-06-mention-sentiment-sov.md](MKT-06-mention-sentiment-sov.md) |
| MKT-07 | MKT | ③집계/분석 | M12 쿠폰/어트리뷰션 기여 집계 | 조인한 로그를 쿠폰 단위 기여 수치로 줄였는가 | 2 | [MKT-07-coupon-roi.md](MKT-07-coupon-roi.md) |
| MKT-08 | MKT | ⑥검증/검수 (+④분류) | M8/M(CRM) 다조건 타게팅 — 발송 대상 추출 | 여러 규칙(휴면∧동의∧미오픈)을 모두 충족하는지 판정했는가 | 2 | [MKT-08-retention-targeting.md](MKT-08-retention-targeting.md) |
| MKT-09 | MKT | ①추출/파싱 (+③집계/분석) | M9 경쟁사 캡처 벤치마킹(OCR) | 캡처 이미지에서 가격·요소를 표로 뽑아냈는가 | 3 | [MKT-09-competitor-capture-benchmark.md](MKT-09-competitor-capture-benchmark.md) |
| MKT-10 | MKT | ⑤초안 작성 | MKT 생성형 공통 — 카피·상세설명 초안 | 주어진 사실로 없던 홍보 문장을 새로 썼는가 | 2 | [MKT-10-product-copy-draft.md](MKT-10-product-copy-draft.md) |

> 전체 메타데이터(원본ID·입력·출력·유형보조·한줄요약 포함)는 [index.csv](index.csv)에 있으며, 노션 DB import의 소스입니다.
