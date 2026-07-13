# catchup-exam — 학생 시험용 code-server 이미지.
# ⭐ 원래 experiments/s1-docker-spike/exam-image/(레포에 없음)에서 빌드되어 git 밖이라 code-server 버전이
#   재빌드마다 latest 로 흔들렸다(webview 회귀의 원인). 이 파일로 레포에 고정하고 버전을 핀한다.
# 빌드: deploy/local-k3d/up.sh 가 `docker build -f deploy/exam-image/Dockerfile deploy/exam-image/`.
FROM node:20.20.2-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip git curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ⭐ code-server 버전 고정 — install.sh 는 버전 미지정이면 latest 를 당겨온다(재빌드마다 달라짐).
#   webview 는 슬롯 subdomain 라우팅(slotN.<host>)에서 정상 동작한다 — subpath 프록시가 아니라 루트 서빙이라
#   service worker scope·secure context 가 올바르다. 버전은 재현성을 위해 항상 이 값으로 핀한다.
ARG CODE_SERVER_VERSION=4.125.0
RUN curl -fsSL https://code-server.dev/install.sh | sh -s -- --version "${CODE_SERVER_VERSION}" \
    && code-server --version

# Claude Code CLI(터미널) — 버전 고정.
RUN npm install -g @anthropic-ai/claude-code@2.1.186

# coder 유저(uid 1000) — base 의 node 유저를 제거하고 재생성(bind mount 권한 정합).
RUN userdel -r node 2>/dev/null || true; groupdel node 2>/dev/null || true; \
    groupadd -g 1000 coder \
    && useradd -m -u 1000 -g 1000 -s /bin/bash coder \
    && mkdir -p /home/coder/project /home/coder/.claude \
    && chown -R coder:coder /home/coder

# Claude Code 확장(webview 사이드바) 프리설치. Open VSX 미존재/네트워크 실패 시 런타임 GUI 설치 폴백.
RUN runuser -u coder -- code-server --install-extension anthropic.claude-code \
    && echo "[ok] anthropic.claude-code 확장 프리설치됨" \
    || echo "[warn] 확장 프리설치 실패(Open VSX 미존재/네트워크 가능) — 런타임 GUI로 설치 폴백"

COPY --chown=coder:coder code-server-settings.json /home/coder/.local/share/code-server/User/settings.json
COPY --chmod=0755 seed-and-start.sh /usr/local/bin/seed-and-start.sh

WORKDIR /home/coder/project
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/seed-and-start.sh"]
