# S1 Docker 스파이크 — 학생 1명 격리 컨테이너 이미지 (docs/2-exam-environment.md §12)
# 환경(이미지)과 문제(데이터)를 분리한다 — 문제는 problem-registry에서 seed로 주입(§4).
# 방식 C(OAuth): claude code를 프리설치하고, OAuth credentials를 주입받아 "이미 로그인된" 상태로 시작.
#   대화는 ~/.claude/projects/*.jsonl 에 자동 기록되고, collector가 그걸 회수한다(프록시 불필요).
FROM node:20-bookworm

# 런타임(python) + code-server 설치 의존성. runuser(util-linux)는 bookworm 기본 포함.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip git curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# code-server = VS Code를 서버에서 돌리고 화면만 브라우저로(§2). 공식 설치 스크립트.
RUN curl -fsSL https://code-server.dev/install.sh | sh

# claude code CLI 프리설치(§3①). 컨테이너 안에서 OAuth credentials로 바로 사용.
RUN npm install -g @anthropic-ai/claude-code

# non-root 학생 사용자(§8 pod 하드닝: non-root). uid 1000 = 호스트 첫 유저와 매칭 → bind mount 권한 정합.
# node 베이스 이미지엔 이미 uid/gid 1000(node)이 있으므로 제거 후 coder로 재생성한다.
RUN userdel -r node 2>/dev/null || true; groupdel node 2>/dev/null || true; \
    groupadd -g 1000 coder \
    && useradd -m -u 1000 -g 1000 -s /bin/bash coder \
    && mkdir -p /home/coder/project /home/coder/.claude \
    && chown -R coder:coder /home/coder

# claude code VS Code 확장 프리설치(coder 홈 ~/.local/share/code-server/extensions 에 구워둠).
# 학생이 매번 GUI로 설치할 필요가 없고 메모리/버전이 일관된다. code-server 기본 레지스트리=Open VSX.
# Open VSX에 없거나 네트워크 이슈면 빌드를 깨지 않고 경고만 — 런타임 GUI 설치로 폴백 가능.
RUN runuser -u coder -- code-server --install-extension anthropic.claude-code \
    && echo "[ok] anthropic.claude-code 확장 프리설치됨" \
    || echo "[warn] 확장 프리설치 실패(Open VSX 미존재/네트워크 가능) — 런타임 GUI로 설치 폴백"

# entrypoint는 root로 시작해 bind mount 권한을 정리한 뒤 coder로 강등 재실행한다(스크립트 내부 로직).
COPY --chmod=0755 seed-and-start.sh /usr/local/bin/seed-and-start.sh

WORKDIR /home/coder/project
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/seed-and-start.sh"]
