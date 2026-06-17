# Update Log

## 2026-06-17
- **Creation**: 시각화 개념 `graph.md` 추가 — 도메인 맵·패키지 의존성·DB ER·슬롯/회차/응시 상태 머신을 Mermaid로 작성(모든 노드·엣지는 마이그레이션 DDL·package.json·검증된 개념에서 추출). 루트 index에 등재.
- **Creation**: OKF v0.1 번들 초기 구성 — `platform/`(11), `database/`(22), `design-system/`(5), `operations/`(8) 개념 문서 생성.
- **Creation**: 번들 루트 `index.md`(okf_version 선언) 및 도메인별 `index.md` 색인 생성.
- **Verification**: 생성된 개념을 실제 코드 구현(`apps/web/lib/**`, `db/migrations/**`, `packages/ui/**`)과 대조해 교정 — 기획 문서와 구현이 다른 지점은 코드 기준으로 정정하고 구현 현황을 명시.
