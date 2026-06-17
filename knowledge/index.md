---
okf_version: "0.1"
---

# CatchUP Knowledge Bundle

CatchUP — AI 테스트 평가 플랫폼 — 의 지식 번들입니다. 플랫폼 설계 결정, PostgreSQL
스키마 카탈로그, CatchUP 디자인 시스템, 제품·운영 지식을 OKF(Open Knowledge Format)
v0.1 개념 문서로 정리했습니다. 사람과 AI 에이전트가 함께 읽는 것을 전제로 합니다.

> 출처 신뢰도: `database/`는 마이그레이션 SQL(스키마의 유일한 정의처)에서, `design-system/`은
> `@app/ui` 실제 소스에서 추출했습니다. `platform/`·`operations/`는 `docs/`의 설계·기획 문서에서
> 추출한 뒤 실제 코드 구현과 대조해 교정했습니다. 각 개념의 `# Citations`로 출처를 추적하세요.

## Domains

- [Platform](./platform/) - 플랫폼의 확정 설계 결정(프레임워크·DB·캐시·인증·보안·라우팅·디자인·반응형·최적화)
- [Database](./database/) - PostgreSQL 스키마 카탈로그(auth·exam·hosted·ops 스키마의 테이블·제약·인덱스)
- [Design System](./design-system/) - CatchUP 디자인 시스템(`@app/ui`): 토큰 체계, 룩앤필, 컴포넌트, 도메인 토큰
- [Operations](./operations/) - 제품·운영 지식(동작 원리, 시험 환경, k8s, 서빙, 스토리지 파이프라인, 구현 계획)
- [지식 그래프 · 시각화](./graph.md) - 도메인 맵·패키지 의존성·DB ER·상태 머신을 Mermaid로 시각화
