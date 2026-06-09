# CatchUP web 이미지 — pnpm 모노레포 빌드 후 custom server(server.mjs)로 실행.
# build context = 모노레포 루트:
#   docker build -f apps/web/Dockerfile -t catchup-web:local .
# 시크릿(DATABASE_URL·SESSION_SECRET·LITELLM_MASTER_KEY 등)은 런타임에 env 로 주입한다
# (.env.secret 은 이미지에 넣지 않음 — server.mjs 의 dotenv 로드는 파일이 없으면 조용히 무시).

FROM node:18-alpine AS base
RUN corepack enable
WORKDIR /app

# ── 빌드: 전체 워크스페이스 install + web 빌드 ──
FROM base AS builder
# .dockerignore 로 node_modules/.next/.git 등은 제외된 소스만 복사.
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @app/web build

# ── 런타임: 빌더 산출물을 통째로 복사(같은 경로 → pnpm 심링크 보존) ──
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /app /app
WORKDIR /app/apps/web
EXPOSE 3000
# 표준 next start 가 아니라 custom server(WS 프록시 포함) 로 기동.
CMD ["node", "server.mjs"]
