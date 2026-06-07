# CatchUP Platform

**실무형 AI 활용 역량 평가 플랫폼**의 웹 제품 모노레포(pnpm workspaces).

객관식 챗봇 테스트가 아니라 **Claude Code·Codex 같은 상용 코딩 에이전트를 시험에서 그대로 허용**하고,
AI와 일한 **과정**과 실제 만들어낸 **결과물**을 함께 평가합니다. UI는 **IBM Carbon** 파운데이션 위에
구축한 **CatchUP 디자인 시스템**으로 만듭니다.

> 제품 기획·개발 순서는 [docs/1-web-platform-planning.md](docs/1-web-platform-planning.md),
> 아키텍처 결정 레퍼런스는 [docs/reference/](docs/reference/)에 있습니다.

## 구조

```
catchup_platform/
├── apps/
│   └── web/              @app/web   Next.js App Router — 유일한 배포 대상 (3개 셸 + API + lib)
├── packages/
│   ├── ui/               @app/ui    디자인 시스템(토큰·아이콘·컴포넌트)        ← 내부 의존 없음
│   └── core/             @app/core  테마(next-themes) + 토스트                ← @app/ui 의존
└── db/                   PostgreSQL 마이그레이션(SQL) + 러너 + 데모 시드
```

의존성 방향은 단방향·비순환: `ui ← core ← web`. 내부 패키지는 빌드리스(`main`→`src`, React는 peerDependency)이며
Next가 `transpilePackages`로 컴파일합니다.

### 앱 라우트 (셸 3개 / 청중 3개)
- **`(marketing)`** — 공개. 랜딩(`/`)·진행 방식·커리큘럼·샘플 리포트. (디자인 쇼케이스는 dev 전용 `/showcase`·`/console`)
- **`(exam)`** — 학생 시험 런타임(풀스크린). intro → 진행(byod 동작 / hosted 자리표시) → done.
- **`(app)`** — 로그인 후 영속 대시보드 셸(역할 필터 메뉴):
  - `my/` 학생 — 내 시험·강의(mock)·리포트(placeholder)
  - `org/` 학교담당자(자기 기관만) — 대시보드·학생(+상세)·회차(+상세)
  - `admin/` 내부 관리자 — 기관(+담당자 발급)·회차(개설·로스터 import·운영)·학생·문제·제출 검증(+상세)

## 시작하기

```bash
./setup.sh        # 사전요구 확인 → 설치 → .env.secret 생성 → DB 기동·마이그레이션·시드 (원클릭)
pnpm dev          # → http://localhost:3000
```

수동:
```bash
pnpm install
cp .env.example .env.secret          # SESSION_SECRET 등은 setup.sh가 자동 생성
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm dev
```

**데모 로그인**(비밀번호 `demo1234`, dev에서만 노출):
`student1@univ-a.ac.kr`(학생) · `staff@univ-a.ac.kr`(학교담당자) · `admin@catchup.io`(내부 관리자)

## 명령어

| 명령 | 설명 |
|---|---|
| `pnpm dev` / `build` / `start` / `lint` | Next 개발·빌드·실행·린트 |
| `pnpm typecheck` | 전 패키지 `tsc --noEmit` |
| `pnpm db:up` / `db:down` | postgres + redis 컨테이너 |
| `pnpm db:migrate` / `db:migrate:status` | `db/migrations/*.sql` 적용 |
| `pnpm db:seed` | 데모 데이터(멱등). production 거부(`SEED_ALLOW_DEMO_ACCOUNTS=1` 필요) |

**검증 기준 = `pnpm build` 통과**(타입체크 + 전 라우트 생성). 별도 테스트 스위트는 아직 없습니다.

## 데이터 레이어

단일 PostgreSQL(정보원, schema 분리: `auth`/`exam`/`hosted`/`ops`) + 단일 Redis(보조, fail-soft).
통합형 Next.js 백엔드: `route.ts`/서버액션(얇게) → `lib/services` → `lib/db/repositories`(SQL은 여기에만, `$1` 바인딩).
스키마 변경은 항상 `db/migrations/`에 새 `00NN_*.sql`로 추가(append-only). 인증은 bcrypt 비밀번호 + HMAC 서명 세션 쿠키.
자세한 규칙은 [CLAUDE.md](CLAUDE.md).

> 채점·리포트는 **외부 시스템(AI-TEST) 소관**이라 이 레포에 없습니다. 사이트는 `accepted submission`까지 만들고,
> 리포트는 외부 산출물의 예시(`/sample-report`)만 보여줍니다. (docs/1 §8)

## 디자인 시스템

`@app/ui` 컴포넌트 + 시맨틱 토큰 유틸리티만 사용(raw 색상·임의 radius 금지, 샤프한 모서리, 2px 블루 포커스 링,
다크모드는 순수 토큰 스왑). 전체 가이드: [packages/ui/README.md](packages/ui/README.md).
