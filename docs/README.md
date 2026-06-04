# JABIS에서 배우는 플랫폼 설계 — 학습 노트

> 목적: JABIS(시니어 개발) 소스를 분석해, 내가 만들 **AI 테스트 평가 플랫폼**(모노레포 1개 + DB 1개 + 심플)에 가져갈 설계 원칙을 정리한다.
> 형식: 단계별 강의 → 각 단계의 "가져갈 것"만 이 docs에 압축 저장.

## 내가 만들 플랫폼의 확정 스택
- **Next.js App Router 통합형** (프론트 + API를 한 앱에). 롤모델 = `jabis-cert`.
- **모노레포** (`apps/ + packages/`), **단일 PostgreSQL DB**(스키마로 도메인 분리), Redis 1개.
- 분리형(jabis-hr SPA + jabis-api-gateway Fastify)은 "조직 규모 요구"용 → 나는 불필요, 반면교사로만 참고.

## 목차
| # | 문서 | 핵심 |
|---|---|---|
| 00 | [⭐ 마스터 체크리스트](./00-master-checklist.md) | 1~9단계 종합 + Phase별 구축 순서 |
| 01 | [프레임워크 & 모노레포](./01-framework-monorepo.md) | apps+packages, 빌드없는 내부패키지, 레이어드 백엔드, Next.js 통합 |
| 02 | [DB 스키마 설계](./02-db-schema.md) | 1 DB + 다중 schema, PK/인덱스/JSONB, 관계·이력·마이그레이션 |
| 03 | [캐시 관리](./03-cache.md) | Redis 1개 namespace, TTL 정책, getOrSet, write 무효화, AI채점 해시캐싱 |
| 04 | [User role 설계](./04-user-role.md) | 인증≠인가 분리, roles 배열 M:N, 프론트UX/백엔드보안, 역할+자원소유권 |
| 05 | [보안](./05-security.md) | bcrypt/JWT/httpOnly쿠키, XSS·SQLi, 공격탐지 IP차단, AI 프롬프트인젝션 |
| 06 | [페이지 설계 & 라우팅](./06-page-routing.md) | 영속 셸+중첩라우트, 주입형 레이아웃, 메뉴/라우트, mock fallback, zustand |
| 07 | [디자인 시스템](./07-design-system.md) | shadcn(Radix+CVA+cn), 의미론적 CSS변수 토큰, 자동 다크모드, 도메인 토큰 |
| 08 | [반응형 웹](./08-responsive.md) | 모바일퍼스트, 보이기/숨기기, 사이드바 드로어, 테이블→카드, min-w-0 함정 |
| 09 | [최적화](./09-optimization.md) | DB풀·N+1·페이지네이션, Next 자동 코드스플리팅, 측정 후 최적화 |

## 관통하는 대원칙 (지금까지)
1. **경계를 이름으로 드러내라** — 패키지 분리, DB schema 분리. 출처가 이름에 보이게.
2. **불변식은 DB가 강제한다** — NOT NULL/UNIQUE/FK/CHECK/트리거. 앱 코드를 믿지 말 것.
3. **단순함은 의도된 선택** — 분리·추상화는 "요구가 생길 때" 도입. 처음부터 과설계 금지.
4. **패턴 > 도구** — 프레임워크를 바꿔도 설계 원칙(레이어, 응답봉투, 검증)은 그대로 이식된다.
