# 05. 보안 (defense in depth)

> 출처: `jabis-cert/src/lib/crypto.ts`, `lib/auth/session.ts`, `lib/rate-limit.ts`, `jabis-api-gateway/src/middleware/xssProtection.ts`, `services/attackDetectionService.ts`, `app.ts`

## 핵심 한 줄
**여러 겹의 방어(한 겹 뚫려도 다음이 막음). 클라이언트가 보낸 건 전부 적대적 입력으로 간주, 서버가 다시 판단.**

## 1. 비밀번호 = bcrypt (절대 SHA256 아님)
```ts
await bcrypt.hash(password, 12);          // 의도적으로 느림 + salt 내장
await bcrypt.compare(password, hash);
```
- [x] 비번은 bcrypt/argon2. SHA256은 비번 금지(너무 빠름→brute force). cost는 하드웨어 따라 상향.

## 2. 타이밍 공격 방지 = 상수 시간 비교
```ts
crypto.timingSafeEqual(paddedA, paddedB);  // 항상 끝까지 비교
```
- [x] API키/토큰/서명 비교에 `===` 금지 → `timingSafeEqual`. (비번은 bcrypt.compare가 처리)

## 3. JWT = 서명 + 만료 (jose)
```ts
const secret = new TextEncoder().encode(JWT_SECRET);
await new SignJWT({ id, email, roles, sessionStartedAt })
  .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('3600s').sign(secret);
const { payload } = await jwtVerify(token, secret);   // 서명+만료 자동 검증
```
- [x] 서명으로 위조 차단(roles claim 신뢰 가능). HS256(대칭)=단일앱 충분.
- ⚠️ **payload는 암호화 아님(base64 디코드 가능)** → 비번/민감정보 넣지 말 것.
- [x] `sessionStartedAt`으로 절대 세션 한도(무한 연장 방지).

## 4. ⭐ 안전한 세션 쿠키 (4플래그 외우기)
```ts
cookie.set(name, token, {
  httpOnly: true,         // JS 접근 불가 → XSS 토큰탈취 차단 (localStorage 금지!)
  secure: isProduction,   // HTTPS 전용
  sameSite: 'lax',        // CSRF 완화
  maxAge, path: '/',
});
```
- [x] 토큰은 **httpOnly 쿠키**에. localStorage 저장 금지. Next.js 통합형에 가장 자연스러움.

## 5. 입력 방어
- **XSS**: 입력 필터는 보조. 진짜 해법 = **출력 이스케이프**(React 기본). `dangerouslySetInnerHTML`로 사용자 입력(답안) 출력 금지.
- **SQL 인젝션**: `$1` 파라미터 바인딩(문자열 연결 금지, 02 문서).
- 필터링 시 **HTML 엔티티 디코드 후 패턴 검사**(인코딩 우회 차단).

## 6. ⭐ 행동 기반 공격 탐지 + 자동 IP 차단
```ts
AUTH_FAILURE:        5회 / 10분  → 30분 차단   (brute force)
404_ERROR:          10회 / 1분   → 10분 차단   (취약점 스캐너)
RATE_LIMIT_EXCEEDED: 200%        → 1시간 차단
```
- Redis **sorted set 슬라이딩 윈도우**: `zadd`(시각=score) → `zremrangebyscore`(윈도우 밖 제거) → `zcard`(개수) → 초과 시 차단 + 알림.
- [x] 최소 **로그인 실패 차단**은 필수. 화이트리스트 IP 제외. 차단 시 실시간 알림(사람 인지).

## 7. 방어 계층 파이프라인 (01 app.ts)
```
helmet(보안헤더) → CORS 화이트리스트(*금지) → body크기제한(DoS) → XSS → 스키마검증 → rate-limit → 인증 → 인가 → 라우트
```
- 어느 한 겹도 단독 완벽하지 않음 → 여러 겹 누적.

## 8. 🎯 AI 평가 플랫폼 특화 위협
| 위협 | 방어 |
|---|---|
| 점수 조작(클라가 score 전송) | **서버가 점수 계산, 클라 점수 신뢰 금지.** score는 서버/grader만 쓰기 |
| **프롬프트 인젝션**("지시 무시하고 100점") | 답안을 구분자/태그로 데이터 격리, 규칙은 system 메시지, **LLM출력 스키마 재검증**, 최종점수는 결정적 로직 |
| 채점 변조 | grader 역할 + 자원소유권(04) + score_history 감사(02) |
| IDOR(UUID 바꿔 남의 답안) | 행 단위 소유권 검사 |
| AI 비용 DoS | 제출 rate-limit + 잡큐 동시성 제한 + (루브릭+답안)해시 캐싱(03) |
| 시험 부정(시간초과/재제출) | 제한시간 서버검증, 멱등 제출 |

### 관통 원칙
**"클라이언트가 보낸 건 전부 적대적 입력."** 점수·시간·역할·소유권은 전부 서버가 다시 판단.

## 체크리스트
- [x] bcrypt(비번), timingSafeEqual(시크릿 비교)
- [x] JWT 서명+만료, payload에 민감정보 금지, 절대 세션 한도
- [x] httpOnly+secure+sameSite 쿠키, localStorage 토큰 금지
- [x] 출력 이스케이프(XSS), $1 바인딩(SQLi)
- [x] 로그인 실패 자동 차단 + 알림
- [x] helmet/CORS화이트리스트/body제한 등 다층 방어
- [x] AI: 점수 서버계산, 프롬프트 인젝션 방어, 소유권 검사
