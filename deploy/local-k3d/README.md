# local-k3d — 로컬 k3d 검증용 순수 manifest

common-helm(harbor 401) 없이 로컬에서 hosted 루프를 띄우는 순수 k8s manifest.
alpha/prod는 catchup-helm 사용. 이 디렉터리는 **로컬 전용**.

## 파일 구성

| 파일 | 내용 |
|------|------|
| `00-namespace.yaml` | Namespace `catchup-local` |
| `01-secrets.yaml` | `app-secrets`(web), `litellm-secrets`(litellm) |
| `10-postgres.yaml` | postgres:16-alpine + litellm DB init ConfigMap + PVC + Service |
| `11-redis.yaml` | redis:7-alpine + Service |
| `12-minio.yaml` | minio/minio + PVC + Service(9000/9001) |
| `20-litellm.yaml` | litellm-config ConfigMap + Deployment + Service(4000) |
| `30-web.yaml` | web Deployment(catchup-web:local) + Service(3000) |
| `40-exam.yaml` | exam StatefulSet(catchup-exam:local) + headless Service(8080) |
| `50-ingress.yaml` | traefik Ingress — web(catchup.localhost) · minio 콘솔(minio.localhost) |
| `argocd-application.yaml` | ArgoCD Application(로컬 GitOps) — origin/exp 의 이 디렉터리를 sync |

## 배포 순서

### 1) 클러스터 생성

```bash
k3d cluster create catchup --agents 1 -p "8080:80@loadbalancer"
```

### 2) 이미지 빌드 후 k3d로 import

```bash
# web 이미지 (모노레포 루트에서)
docker build -f apps/web/Dockerfile -t catchup-web:local .

# exam 이미지
docker build -f experiments/s1-docker-spike/exam-image/Dockerfile \
  -t catchup-exam:local experiments/s1-docker-spike/exam-image/

# k3d 클러스터에 주입 (imagePullPolicy: Never 이므로 반드시 import)
k3d image import catchup-web:local catchup-exam:local -c catchup
```

### 3) manifest 전체 적용

```bash
kubectl apply -f deploy/local-k3d/
```

적용 순서는 파일명 번호 순(00→40). 의존 관계: postgres/redis가 ready 된 후 litellm/web이 붙음.
readinessProbe가 설정돼 있으므로 Deployment rollout으로 ready 확인 가능:

```bash
kubectl -n catchup-local rollout status deployment/postgres
kubectl -n catchup-local rollout status deployment/litellm
kubectl -n catchup-local rollout status deployment/web
kubectl -n catchup-local get pods
```

### 4) DB 마이그레이션

web pod에서 또는 로컬에서 postgres를 port-forward 후 실행:

```bash
# port-forward (별도 터미널)
kubectl -n catchup-local port-forward svc/postgres 5433:5432

# 마이그레이션 (모노레포 루트, .env.secret 에 DATABASE_URL=postgresql://catchup:catchup@localhost:5433/catchup)
DATABASE_URL=postgresql://catchup:catchup@localhost:5433/catchup pnpm db:migrate
```

### 5) 데모 데이터 시드 (선택)

```bash
DATABASE_URL=postgresql://catchup:catchup@localhost:5433/catchup node db/seed.mjs
```

`db/seed.mjs`가 exam batch/attempt 포함 데모 데이터를 심는다(멱등·재실행 가능).
batch와 attempt가 없으면 아래 psql 예시로 직접 생성:

```sql
-- psql -h localhost -p 5433 -U catchup -d catchup
INSERT INTO exam.batches (id, title, problem_id, starts_at, ends_at)
VALUES ('batch-local-01', '로컬 검증 회차', 'ainc2026',
        now(), now() + interval '2 hours');

INSERT INTO exam.attempts (id, batch_id, examinee_id, status, started_at, deadline_at)
VALUES ('attempt-local-0', 'batch-local-01',
        '<user-id>', 'running', now(), now() + interval '2 hours');
```

### 6) exam slot 등록

exam StatefulSet pod의 endpoint를 web에 등록해야 iframe 프록시가 동작한다.

```bash
# exam pod DNS: exam-0.exam.catchup-local.svc.cluster.local:8080
curl -X POST http://localhost:3000/api/internal/slots/register \
  -H "Content-Type: application/json" \
  -H "x-internal-secret: dev-internal-secret" \
  -d '{
    "batchId": "batch-local-01",
    "slotNo": 0,
    "endpoint": "http://exam-0.exam.catchup-local.svc.cluster.local:8080"
  }'
```

web을 포트포워드 하거나 Ingress를 붙인 경우 호스트 주소를 조정한다.

### 7) 접속 확인

```bash
# web 포트포워드
kubectl -n catchup-local port-forward svc/web 3000:3000

# 브라우저
open http://localhost:3000
```

exam IDE iframe: `http://localhost:3000/exam/<attempt-id>/ide`

### ingress 경유(port-forward 대신)

`50-ingress.yaml` + traefik(k3d LB 가 호스트 :80·:8088 → traefik:80)로 호스트명 접속:

```
http://catchup.localhost    web 앱(메인). 시험 페이지는 이 하위 라우트(/exam/<attemptId>)
http://litellm.localhost    litellm 대시보드 (로그인: LITELLM_MASTER_KEY)
http://minio.localhost      minio 콘솔 (버킷 폴더·객체 열람)
```

`*.localhost` 는 loopback(127.0.0.1)으로 해석된다(RFC 6761). **Windows 브라우저에서 "연결할 수 없음"이 뜨면**
`C:\Windows\System32\drivers\etc\hosts` 에 `127.0.0.1 catchup.localhost litellm.localhost minio.localhost` 추가.
(리눅스/맥은 `/etc/hosts`.) argocd UI는 https 리다이렉트 때문에 ingress 대신
`kubectl -n argocd port-forward svc/argocd-server 8081:443` 권장.

> **시험 페이지(exam)는 별도 ingress 가 없다 — 의도된 설계.** 학생은 code-server(exam pod)에 직접 닿지 않고
> web 이 iframe + WebSocket 으로 역프록시하며 인증·마감을 중재한다(docs/2·docs/4). 그래서 시험 화면은
> `http://catchup.localhost/exam/<attemptId>` 로 web 하위에서 열린다. **클릭 시 pod 가 비로소 뜨는 동적 프로비전**은
> exam-ops(Phase 3) 소관 — 현재 로컬엔 정적 `exam-0` 1개만 떠 있고, 자동 0↔N 스케일은 미구현이다.

## 삭제

```bash
kubectl delete -f deploy/local-k3d/
# 또는 클러스터 통째로
k3d cluster delete catchup
```

## 주의사항

- `imagePullPolicy: Never` — 반드시 `k3d image import` 후 적용
- ANTHROPIC_API_KEY는 빈 값으로 설정됨 — 실제 LLM 호출이 필요하면 `01-secrets.yaml`의
  `litellm-secrets.ANTHROPIC_API_KEY`를 실제 키로 교체 후 재적용
- exam pod은 `/registry/<PROBLEM_ID>/scaffold` 가 있어야 시드 성공.
  scaffold가 없으면 `[seed] ERROR`로 종료 → 이미지에 registry를 포함하거나
  ConfigMap/hostPath로 `/registry`를 마운트해야 함
- NetworkPolicy는 로컬 검증 편의상 미포함 (alpha/prod는 catchup-helm의 exam-networkpolicy.yaml 사용)
