# CatchUP 디자인 시스템

IBM Carbon 파운데이션 위에 구축한 CatchUP 디자인 시스템(`@app/ui`) 지식 묶음.

- [tokens.md](./tokens.md) - 2겹 토큰 구조(raw Carbon 램프 → semantic 역할)와 Tailwind preset 매핑, 다크모드 순수 토큰 스왑 방식
- [look-and-feel.md](./look-and-feel.md) - 샤프한 모서리, 1px 보더, 떠 있는 레이어 그림자, 2px 포커스 링, IBM Plex 타이포, 동사 우선 sentence-case 카피 등 비타협 시각 규칙
- [components.md](./components.md) - `@app/ui` 전체 export 목록(프리미티브 12종 + 콘솔 킷 6종)과 cva, forwardRef, asChild, 'use client' 구현 컨벤션
- [domain-tokens.md](./domain-tokens.md) - 평가 플랫폼 도메인 의미 토큰(score-pass/fail/partial, status-grading) 추가 원칙 및 절차
