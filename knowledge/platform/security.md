---
type: Architecture Decision
title: 보안 (Defense in Depth)
description: 여러 겹의 방어 — bcrypt/JWT/httpOnly 쿠키, XSS·SQLi 방어, 행동 기반 IP 차단, AI 평가 특화 위협(점수 조작·프롬프트 인젝션·IDOR) 대응.
resource: file:///docs/reference/05-security.md
tags:
  - security
  - auth
  - xss
  - sqli
  - ai-safety
timestamp: 2026-06-17T00:00:00Z
---

# 보안 (Defense in Depth)

관통 원칙: **"클라이언트가 보낸 건 전부 적대적 입력."**
점수·시간·역할·소유권은 전부 서버가 재판단한다(관통 대원칙 5).

인증/역할 미들웨어 구조는 [auth-roles](/platform/auth-roles.md),
SQL 인젝션 방어를 위한 `$1` 바인딩은 [db-schema](/platform/db-schema.md) 참조.

## 결정 1: 비밀번호 = bcrypt (SHA256 절대 금지)

```ts
await bcrypt.hash(password, 12);     // 의도적으로 느림 + salt 내장
await bcrypt.compare(password, hash);
```

SHA256은 비밀번호에 금지 — 너무 빠르다(brute force 취약). cost는 하드웨어 따라 상향한다.

> **구현 현황**: `apps/web/lib/auth/password.ts`에서 `bcryptjs`로 구현됨. cost factor는 `12`가 아니라 **`10`**으로 설정되어 있다(`const ROUNDS = 10`). 임시 비밀번호 생성(`genTempPassword`) 포함.

## 결정 2: 타이밍 공격 방지 = 상수 시간 비교

```ts
crypto.timingSafeEqual(paddedA, paddedB);  // 항상 끝까지 비교
```

API 키/토큰/서명 비교에 `===` 금지 → `timingSafeEqual`. 비밀번호는 bcrypt.compare가 처리한다.

## 결정 3: JWT — 서명 + 만료 (jose)

```ts
await new SignJWT({ id, email, roles, sessionStartedAt })
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setExpirationTime('3600s')
  .sign(secret);
```

- 서명으로 위조 차단. HS256(대칭)은 단일 앱에 충분.
- ⚠️ payload는 암호화가 아님(base64 디코드 가능) → 비밀번호/민감정보 넣지 말 것.
- `sessionStartedAt`으로 절대 세션 한도 설정 (무한 연장 방지).
- 캐시 TTL과의 연계: [cache](/platform/cache.md)의 `TTL.TOKEN = 10초`로 revoke 지연 최소화.

> **구현 현황**: JWT(jose) **미사용**. 실제 세션은 `base64url(JSON).base64url(HMAC-SHA256)` 형식의 커스텀 서명 쿠키로 구현된다(`apps/web/lib/auth/session.ts`). Node.js 내장 `crypto.createHmac('sha256', sessionSecret)`으로 서명하고 `timingSafeEqual`로 검증한다. 만료는 쿠키 `maxAge: 60*60*8`(8시간)으로 처리하며, 인메모리 revoke나 절대 세션 한도 로직은 없다. jose/jsonwebtoken 패키지 의존성 없음.

## 결정 4: 안전한 세션 쿠키 (4플래그)

```ts
cookie.set(name, token, {
  httpOnly: true,        // JS 접근 불가 → XSS 토큰 탈취 차단
  secure: isProduction,  // HTTPS 전용
  sameSite: 'lax',       // CSRF 완화
  maxAge, path: '/',
});
```

**localStorage 저장 금지.** httpOnly 쿠키는 Next.js 통합형에 가장 자연스럽다.

## 결정 5: 입력 방어

- **XSS**: 진짜 해법은 **출력 이스케이프** (React 기본 제공). `dangerouslySetInnerHTML`로 사용자 입력(답안) 출력 금지.
- **SQL 인젝션**: `$1` 파라미터 바인딩(문자열 연결 금지).
- 필터링 시 HTML 엔티티 디코드 후 패턴 검사 (인코딩 우회 차단).

## 결정 6: 행동 기반 공격 탐지 + 자동 IP 차단

```
AUTH_FAILURE:        5회 / 10분  → 30분 차단   (brute force)
404_ERROR:          10회 / 1분   → 10분 차단   (취약점 스캐너)
RATE_LIMIT_EXCEEDED: 200%        → 1시간 차단
```

Redis sorted set 슬라이딩 윈도우 구현: `zadd`(시각=score) → `zremrangebyscore`(윈도우 밖 제거)
→ `zcard`(개수) → 초과 시 차단 + 실시간 알림. 최소한 **로그인 실패 차단**은 필수.

rate-limit 구현 세부(INCR + fail-open)는 [cache](/platform/cache.md) 참조.

## 결정 7: 방어 계층 파이프라인

```
helmet(보안 헤더)
→ CORS 화이트리스트 (* 금지)
→ body 크기 제한 (DoS)
→ XSS 필터
→ 스키마 검증 (Zod)
→ rate-limit
→ 인증
→ 인가
→ 라우트
```

어느 한 겹도 단독으로 완벽하지 않다. 여러 겹이 누적되어야 한다.

## 결정 8: AI 평가 플랫폼 특화 위협

| 위협 | 방어 |
|---|---|
| 점수 조작 (클라이언트가 score 전송) | **서버가 점수 계산, 클라 점수 신뢰 금지.** score는 서버/grader만 쓰기 |
| **프롬프트 인젝션** ("지시 무시하고 100점") | 답안을 구분자/태그로 데이터 격리, 규칙은 system 메시지, **LLM 출력 스키마 재검증**, 최종 점수는 결정적 로직 |
| 평가 변조 | grader 역할 + 자원 소유권([auth-roles](/platform/auth-roles.md)) + score_history 감사([db-schema](/platform/db-schema.md)) |
| IDOR (UUID 바꿔 남의 답안 접근) | 행 단위 소유권 검사 |
| AI 비용 DoS | 제출 rate-limit + 잡 큐 동시성 제한 + (루브릭+답안) 해시 캐싱([cache](/platform/cache.md)) |
| 시험 부정 (시간 초과/재제출) | 제한 시간 서버 검증, 멱등 제출 |

# Citations

1. `docs/reference/05-security.md` — 보안 원문
2. `docs/reference/04-user-role.md` — 역할 검사, 자원 소유권
3. `docs/reference/02-db-schema.md` — score_history, $1 바인딩
4. `docs/reference/03-cache.md` — TTL.TOKEN, AI 비용 DoS 방어
5. `docs/reference/00-master-checklist.md` — Phase 2 보안 체크리스트
