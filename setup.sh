#!/usr/bin/env bash
# CatchUP 플랫폼 — 새 PC 원클릭 셋업.
# 사전요구 확인 → 의존성 설치 → .env.secret 생성 → DB 기동·대기 → 마이그레이션 → 시드.
# 멱등: 여러 번 돌려도 안전(이미 된 단계는 건너뜀). 근거: CLAUDE.md "명령어" + docker-compose.yml.
#
# 사용:
#   ./setup.sh            # 전체 셋업(설치+DB+마이그레이션+시드)
#   ./setup.sh --no-seed  # 데모 시드는 건너뜀
set -euo pipefail

# 스크립트 위치(레포 루트)로 이동 — 어디서 실행해도 동작.
cd "$(dirname "$0")"

SEED=1
[[ "${1:-}" == "--no-seed" ]] && SEED=0

# 색 출력 헬퍼
b() { printf '\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
err() { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; }
step() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }

# ── 0. 사전 요구사항 ──────────────────────────────────────────────────────
step "사전 요구사항 확인"

if ! command -v node >/dev/null 2>&1; then
  err "Node.js가 없습니다. https://nodejs.org (>=18.18) 설치 후 다시 실행하세요."
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
NODE_MINOR="$(node -p 'process.versions.node.split(".")[1]')"
if (( NODE_MAJOR < 18 || (NODE_MAJOR == 18 && NODE_MINOR < 18) )); then
  err "Node.js >= 18.18 이 필요합니다(현재 $(node -v))."
  exit 1
fi
ok "Node.js $(node -v)"

if ! command -v pnpm >/dev/null 2>&1; then
  err "pnpm이 없습니다. 'corepack enable && corepack prepare pnpm@9.15.9 --activate' 또는 'npm i -g pnpm' 후 다시 실행하세요."
  exit 1
fi
ok "pnpm $(pnpm -v)"

if ! command -v docker >/dev/null 2>&1; then
  err "Docker가 없습니다. https://docs.docker.com/get-docker 설치 후 다시 실행하세요."
  exit 1
fi
# docker compose(v2) vs docker-compose(v1) 둘 다 지원
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  err "Docker Compose가 없습니다(‘docker compose’/‘docker-compose’ 모두 불가)."
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  err "Docker 데몬이 실행 중이 아닙니다. Docker Desktop/daemon을 켠 뒤 다시 실행하세요."
  exit 1
fi
ok "Docker / ${DC}"

# ── 1. 환경 파일(.env.secret) ─────────────────────────────────────────────
step ".env.secret 준비"
if [[ -f .env.secret ]]; then
  ok ".env.secret 이미 존재 — 유지"
else
  cp .env.example .env.secret
  # 안전한 SESSION_SECRET 자동 생성(템플릿의 불안정 기본값 치환)
  SECRET="$(node -e 'console.log(require("crypto").randomBytes(48).toString("base64url"))')"
  # macOS(BSD)/Linux(GNU) sed 양쪽 호환을 위해 node로 in-place 치환
  node -e '
    const fs = require("fs");
    const f = ".env.secret";
    let s = fs.readFileSync(f, "utf8");
    s = s.replace(/^SESSION_SECRET=.*$/m, "SESSION_SECRET=" + process.argv[1]);
    fs.writeFileSync(f, s);
  ' "$SECRET"
  ok ".env.secret 생성 + SESSION_SECRET 랜덤 발급"
fi

# DB 자격증명을 .env.secret에서 읽어 헬스체크/마이그레이션에 사용
# (POSTGRES_* 오버라이드가 있으면 그것을, 없으면 docker-compose 기본값을 따른다)
PG_USER="$(grep -E '^POSTGRES_USER=' .env.secret | tail -1 | cut -d= -f2- || true)"; PG_USER="${PG_USER:-catchup}"
PG_DB="$(grep -E '^POSTGRES_DB=' .env.secret | tail -1 | cut -d= -f2- || true)"; PG_DB="${PG_DB:-catchup}"

# ── 2. 의존성 설치 ────────────────────────────────────────────────────────
step "의존성 설치 (pnpm install)"
pnpm install
ok "워크스페이스 부트스트랩 완료"

# ── 3. DB/캐시/스토리지 컨테이너 기동 ──────────────────────────────────────
step "PostgreSQL · Redis · MinIO 컨테이너 기동"
$DC up -d
ok "컨테이너 기동 요청 완료"

# ── 3b. MinIO 버킷 부트스트랩 (일회성 mc — 잔재 컨테이너 없음) ──────────────
# docs/5 §2: scaffold/hidden/artifacts/chatlogs, 전부 private(서버 자격으로만 접근).
# minio 컨테이너 네트워크에 붙어 readiness까지 대기 후 생성(멱등). 앱도 첫 put에서 ensureBucket로 자동 생성하므로 실패해도 치명적 아님.
step "MinIO 버킷 생성"
MINIO_USER="${MINIO_ROOT_USER:-catchup}"; MINIO_PASS="${MINIO_ROOT_PASSWORD:-catchup-minio}"
MINIO_NET="$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' catchup-minio 2>/dev/null || true)"
if [[ -n "$MINIO_NET" ]] && docker run --rm --network "$MINIO_NET" --entrypoint /bin/sh minio/mc:latest -c "
  until mc alias set local http://minio:9000 '$MINIO_USER' '$MINIO_PASS' >/dev/null 2>&1; do sleep 1; done
  for b in exam-scaffold exam-hidden exam-artifacts exam-chatlogs; do mc mb -p \"local/\$b\" >/dev/null 2>&1; mc anonymous set none \"local/\$b\" >/dev/null 2>&1; done
" >/dev/null 2>&1; then
  ok "버킷 4종 준비(scaffold/hidden/artifacts/chatlogs, 전부 private)"
else
  err "MinIO 버킷 자동 생성 실패 — 앱이 첫 put에서 자동 생성하므로 치명적 아님('docker logs catchup-minio'로 확인)"
fi

# ── 4. Postgres 준비 대기(healthy) ───────────────────────────────────────
step "PostgreSQL 준비 대기"
TRIES=0
until docker exec catchup-postgres pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1; do
  TRIES=$((TRIES + 1))
  if (( TRIES > 30 )); then
    err "PostgreSQL이 시간 내 준비되지 않았습니다. '$DC logs postgres'로 확인하세요."
    exit 1
  fi
  printf '  … 대기 중 (%s/30)\r' "$TRIES"
  sleep 2
done
ok "PostgreSQL 준비 완료"

# ── 5. 마이그레이션 ───────────────────────────────────────────────────────
step "DB 마이그레이션 적용"
pnpm db:migrate
ok "마이그레이션 완료"

# ── 6. 데모 시드(선택) ────────────────────────────────────────────────────
if (( SEED )); then
  step "데모 시드 적용"
  pnpm db:seed
  ok "데모 데이터 적재 완료"
else
  printf '\n  (--no-seed: 데모 시드 건너뜀. 나중에 pnpm db:seed)\n'
fi

# ── 완료 안내 ─────────────────────────────────────────────────────────────
b ""
b "✅ 셋업 완료!"
cat <<'EOF'

  개발 서버 실행:
    pnpm dev            → http://localhost:3000

  데모 로그인(stub, 비밀번호는 아무 값이나):
    student1@univ-a.ac.kr   (학생)
    staff@univ-a.ac.kr      (학교담당자)
    admin@catchup.io        (내부 관리자)

  자주 쓰는 명령:
    pnpm typecheck        타입 체크
    pnpm build            프로덕션 빌드(= 완료 기준)
    pnpm db:migrate:status 마이그레이션 상태
    pnpm db:seed          데모 데이터 재적재(멱등)
    docker compose down   DB/캐시 컨테이너 종료

EOF
