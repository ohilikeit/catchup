# engines/aggregate — 집계/분석 엔진 (Computed ±ε 채점)

정형 raw 로그 → 그룹별 요약 지표. "행을 줄여 수치·인사이트로". 채점유형 = **Computed**(합계·건수는 정수 Exact, 율·평균은 ±ε 허용오차).

## 구성
- `build_dataset.py` — 단일 입력 `spec.csv`(그룹별 카운트/파라미터) → raw 로그(1행=1이벤트) + 빈 제출양식 2종 + 분리형 given(=Part1 정답) + 정답키 2종을 항상 정합 재생성. **정답은 spec 숫자를 베끼지 않고 생성된 raw 로그를 `regroup_metrics`로 재집계해 도출**(`cross_check`가 로그재집계==spec 일치를 fail-loud 자기검증).
- `grade.py` — Part1 그룹별 집계표(셀: `norm_int` 정수 정확 / `norm_float(tol)` 율·평균 ±ε) + Part2 전체 요약(가중 집계) + 무결성. `float_eq`는 `round(abs(a-s),4) < tol` 엄격 미만 — 부동소수 잡음은 제거하되 반올림 경계 오답은 처벌.
- `spec.example.csv` — 예시 입력.

## 결정성 3종
`ASSIGN_DATE` 고정(이벤트일 합성) · `random.seed` 고정(어느 행이 오픈/클릭/전환인지) · 전역 누적상태 없음(모든 합성은 지역 리스트).

## 핵심 결정성 함정
**분모 0**(이벤트 0 그룹 → 율 0.0 규칙) · **반올림 경계**(X.X5 → half-up 규칙, ±ε 허용오차) · **가중평균 vs 단순평균**(전체 율 = 합계기반 가중, 그룹 율의 단순평균 아님).

## 실행
```bash
python3 build_dataset.py            # spec.csv → 로그·양식·정답
python3 grade.py --part1 <집계표> --part2 <요약> --answer-dir <answer_key>   # 자기채점 100 이어야 함
```

## 새 집계 테마로 적응
`references/aggregate-engine-guide.md` 참조 — spec.csv 그룹 스키마·raw 로그 전개·지표 정의·반올림/분모0 규칙·Computed 채점을 어디서 바꾸는지 단계별. 레퍼런스 과제: `problems/marketing/2.email_campaign_metrics`.
