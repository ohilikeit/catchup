# S1 Docker 스파이크 — 학생별 독립 컨테이너 + LiteLLM 게이트웨이

> 출처: [docs/2-exam-environment.md](../../docs/2-exam-environment.md) **§12 "S1 Docker 스파이크"**.
> 목적: 어댑터 A(hosted)의 **핵심 루프**를 k3s/ArgoCD 없이 **Docker만**으로 증명한다.
> 구현 계획 전체는 [docs/6-implementation-plan.md](../../docs/6-implementation-plan.md).

## 무엇을 증명하는가

1. **격리 환경** — 학생별 독립 컨테이너의 code-server(브라우저 VS Code)에서 풀이.
2. **AI 제공 + 중앙 통제** — claude code가 **LiteLLM 게이트웨이**를 거쳐 Anthropic 호출. 진짜 키는 게이트웨이에만, 컨테이너엔 **가상키만**. 모델은 **Sonnet으로 강제**.
3. **문제 주입** — `PROBLEM_ID`만 바꿔 재기동하면 **다른 문제**가 환경에 들어와 있다.

## 인증 아키텍처 — 게이트웨이 + 가상키 (공식 권장)

claude code OAuth는 컨테이너에서 콜백이 깨진다(공식 문서: WSL2/컨테이너). 그래서 **`ANTHROPIC_BASE_URL`+`ANTHROPIC_AUTH_TOKEN`(가상키)**로 게이트웨이를 가리킨다.

```
학생 브라우저 ─→ [code-server] ─내부→ [claude code]
                     │ BASE_URL=http://proxy:4000, AUTH_TOKEN=가상키(탈취돼도 무력)
                     ▼
                 [LiteLLM proxy] ──진짜 키(.env.secret)──→ api.anthropic.com
                     │ "*"→Sonnet 강제 · 가상키 예산상한·만료 · spend/대화 로깅
                     └ litellm-db(postgres): 가상키·spend 저장
```

- **진짜 키는 proxy에만** — 학생이 컨테이너 셸을 쥐어도 `env`엔 가상키뿐. 가상키는 게이트웨이가 예산상한·만료·차단으로 통제 → 노출돼도 무력.
- **가상키 자동 발급** — `scripts/run-spike.sh`가 attempt마다 `/key/generate`로 발급해 컨테이너에 주입. 운영자는 **진짜 키 1개만** 제공.
- **Sonnet 강제** — 게이트웨이 `config.yaml`의 `model_name: "*"`가 무슨 모델 요청이든 Sonnet으로 라우팅(클라 설정은 우회 가능 → 서버가 최종 보증).
- (보조) **대화 회수** — `collector/collect.mjs`가 `~/.claude/projects/*.jsonl` transcript를 회수→정규화(§10)→sha256 봉인. 게이트웨이 로깅과 병행 가능.

## 디렉터리

```
exam-image/            학생 컨테이너 이미지: code-server + node/python + claude code(+확장) 프리설치
  Dockerfile
  seed-and-start.sh    entrypoint: 권한정리 → crash-safe seeder → code-server 기동
proxy/
  config.yaml          LiteLLM 게이트웨이: "*"→Sonnet 강제, master_key, DB
scripts/
  run-spike.sh         전체 오케스트레이션: db→proxy→가상키 발급→exam
  issue-key.sh         가상키 1개 발급(/key/generate: 예산·만료·Sonnet)
collector/
  collect.mjs          ~/.claude/projects/*.jsonl 회수 → §10 정규화 → out/<attempt>/ 봉인
problem-registry/      환경과 분리된 "문제 = 데이터"(§4)
  ainc2026/{scaffold,hidden-tests}             실제 AI Native Challenge 문제
  planning-2026-09-A·B/{scaffold,hidden-tests} 샘플(PROBLEM_ID 교체 검증용)
runtime/<attempt>/     컨테이너에 bind되는 학생 홈(.claude, project) (gitignore)
out/<attempt>/         회수된 정규화 submission + 봉인 (gitignore)
docker-compose.yml     exam + proxy(LiteLLM) + litellm-db
.env.secret            진짜 Anthropic 키 + master key (gitignore)
```

---

## 실행

### 0) 시크릿 준비 (최초 1회)
```bash
cd experiments/s1-docker-spike
cp .env.secret.example .env.secret
# .env.secret 의 ANTHROPIC_API_KEY 에 진짜 키 입력(게이트웨이에만 보관됨)
```

### 1) 전체 기동 (한 줄)
```bash
scripts/run-spike.sh
#  → litellm-db + proxy 기동 → 가상키 자동 발급 → exam 컨테이너에 주입해 기동
#  → 학생 IDE   : http://localhost:8080   (문제 = ainc2026 기본)
#  → 게이트웨이 : http://localhost:4000/ui (LiteLLM Admin UI: 키·spend 모니터링)
```
- IDE 터미널에서 `claude` 실행 → 게이트웨이 경유로 동작(모델은 Sonnet 강제).

### 2) 문제 교체 — `PROBLEM_ID`만 바꿔 재기동
```bash
docker compose down
docker run --rm -v "$(pwd)/runtime:/r" alpine rm -rf /r/spike-1   # 작업 디렉터리 초기화
PROBLEM_ID=planning-2026-09-B scripts/run-spike.sh
# → :8080 에 이제 문제 B가 들어와 있다. 같은 이미지, 문제만 갈림.
```

### 3) 대화 회수 (보조)
```bash
node collector/collect.mjs spike-1
cat out/spike-1/chat-log.v1.json          # §10 정규화
cat out/spike-1/chat-log.v1.json.sha256   # 봉인 해시
```

### 4) 가상키 spend 확인
```bash
curl -s http://localhost:4000/key/info -H "Authorization: Bearer sk-master-dev" \
  -G --data-urlencode "key=<발급된 가상키>"
```

### 정리
```bash
docker compose down            # 컨테이너 정리 (litellm-db 볼륨은 유지)
```

---

## 성공 기준 (§12 게이트 — 검증 완료)

- [x] 브라우저 `:8080`에서 code-server(VS Code) 동작, claude code·확장 프리설치
- [x] **가상키 자동 발급**(예산 $5·만료 4h·Sonnet-only), 컨테이너엔 **가상키만**(진짜 키 없음)
- [x] claude code가 **게이트웨이 경유** 동작 + **Sonnet 강제 라우팅**(`Received Model Group=claude-sonnet-4-5`)
- [x] **인증 통과** 확인(크레딧 부족 400은 인증 성공의 증거, 401 아님)
- [x] `PROBLEM_ID` 교체 재기동 시 **다른 문제** 주입(ainc2026 xlsx 무결성 md5 일치)
- [x] hidden-tests는 환경(`/workspace`)에 **미포함**(레지스트리엔 존재, 컨테이너 밖)
- [x] 자원 cgroup 제한 실측(2cpu/4g, 부하 시 ~198% cap)

## 정규화 포맷 (§10)
```jsonc
{ "version":1, "tool":"claude-code", "model":"...",
  "messages":[ {"id","index","role","content","ts","tool_calls","attachments"} ],
  "meta":{ "attemptId","source":"transcript","sourceHash":"sha256:..." } }
```

## 다음 단계 (S2)
같은 이미지·seeder·게이트웨이·정규화 포맷을 k8s 매니페스트로 옮겨 50명 동시 운영.
상세: [docs/3](../../docs/3-s2-k8s-skeleton.md)(매니페스트) · [docs/4](../../docs/4-exam-serving-overview.md)(운영) · [docs/5](../../docs/5-storage-submission-pipeline.md)(스토리지) · [docs/6](../../docs/6-implementation-plan.md)(구현 계획).
