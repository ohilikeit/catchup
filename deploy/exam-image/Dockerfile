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

# exam-bootstrap — 최초 진입 UX 보정 확장(언팩). Claude 패널 빈 화면(SW 레이스) 복구 + 파일트리 전체 펼침.
#   code-server 는 언팩 폴더만으론 로드하지 않고 extensions/extensions.json 매니페스트를 신뢰한다
#   → 폴더 COPY 후 그 매니페스트에 항목을 등록해야 실제로 로드된다(--list-extensions 로 검증).
COPY --chown=coder:coder ext-exam-bootstrap \
     /home/coder/.local/share/code-server/extensions/catchup.exam-bootstrap-0.0.1
RUN runuser -u coder -- node -e ' \
      const fs=require("fs"); \
      const dir="/home/coder/.local/share/code-server/extensions"; \
      const f=dir+"/extensions.json"; \
      const rel="catchup.exam-bootstrap-0.0.1"; const abs=dir+"/"+rel; \
      const arr=JSON.parse(fs.readFileSync(f,"utf8")); \
      if(!arr.some(e=>e.identifier&&e.identifier.id==="catchup.exam-bootstrap")){ \
        arr.push({identifier:{id:"catchup.exam-bootstrap"},version:"0.0.1", \
          location:{"$mid":1,fsPath:abs,external:"file://"+abs,path:abs,scheme:"file"}, \
          relativeLocation:rel, \
          metadata:{installedTimestamp:Date.now(),source:"resource",updated:false,private:false,isPreReleaseVersion:false,hasPreReleaseVersion:false}}); \
        fs.writeFileSync(f,JSON.stringify(arr)); \
      } \
    ' \
    && runuser -u coder -- code-server --list-extensions 2>/dev/null | grep -qi exam-bootstrap \
    && echo "[ok] exam-bootstrap 확장 등록·로드 확인" \
    || (echo "[err] exam-bootstrap 등록 실패" && exit 1)

COPY --chown=coder:coder code-server-settings.json /home/coder/.local/share/code-server/User/settings.json
COPY --chmod=0755 seed-and-start.sh /usr/local/bin/seed-and-start.sh

WORKDIR /home/coder/project
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/seed-and-start.sh"]
