# catchup-helm — exam-platform 배포 차트

CatchUP 최종 시험 환경의 배포 차트. **사내 표준(`catchairecruit-helm`)과 동일한 형태** —
`common-helm` 라이브러리에 의존하는 **umbrella chart**이고, 레포는 `{stage}-applications-values.yaml`·
`{stage}-ingress-values.yaml` 로 **values만** 정의한다.

> 📦 지금은 모노레포(`catchup`) 안 디렉토리. 로컬 검증 후 alpha 단계에서 별도 `catchup-helm` 레포로 분리하고
> ArgoCD source 를 그 레포로 돌린다(사내 app/deploy 분리 정책, docs/3 §5.1).

## 구조

```
catchup-helm/
  Chart.yaml                       # common-helm 1.2.24 dependency (oci://harbor-jinhak.../common)
  templates/                       # ★ common-helm 이 표현 못 하는 특수 워크로드(커스텀, neo4j custom-service 선례)
    litellm.yaml                   #   LiteLLM ConfigMap+Deployment+Service (내부 전용)
    exam-statefulset.yaml          #   exam StatefulSet(0↔N) + headless Service
    exam-networkpolicy.yaml        #   학생 pod egress 차단
    _helpers.tpl                   #   namespace={namespace}-{stage} 등 (common-helm 컨벤션 재현)
  {local,alpha,prod}-applications-values.yaml   # common-helm: web 상주 / examPlatform: litellm·exam
  {local,alpha,prod}-ingress-values.yaml        # common-helm: ingress (web 만 외부 노출)
  batches/current.yaml             # 회차 overlay — exam-ops 가 examPlatform.exam.replicas/problemId 커밋
  argocd/application.yaml          # ArgoCD Application 예시
```

## 컴포넌트 배치 (사내 표준 vs 커스텀)

| 컴포넌트 | 수명 | 배포 방식 | 비고 |
|---|---|---|---|
| **web** | 상주 | **common-helm** `applications.catchup-web` | 유일한 외부 노출(Ingress, websocket). 시크릿=Vault, 외부 인프라=hostAliases |
| **litellm** | 상주 | **커스텀** `templates/litellm.yaml` | 내부 전용. `*`→Sonnet 강제. config.yaml ConfigMap 필요 → common-helm 으로 표현 불가 |
| **exam** | 임시 0↔N | **커스텀** `templates/exam-statefulset.yaml` | 50명 독립 워크스페이스(PVC)+seeder → StatefulSet 필수. common-helm 미지원 |
| **NetworkPolicy** | — | **커스텀** | 학생 pod egress=litellm+DNS 만 |
| **postgres·redis·minio** | 상주 | 배포 안 함 | **hostAliases 로 사내 기존 것 참조**(사내 표준). local 만 호스트 docker-compose 재사용 |

> **왜 web 만 common-helm 인가**: `common-helm`(Deployment·Service·PVC·Ingress·Vault)은 상주 web 에 딱 맞지만,
> StatefulSet·initContainer·임의 ConfigMap·NetworkPolicy 는 지원하지 않는다. 그 특수 워크로드는 사내에서도
> 쓰는 방식 — **umbrella chart 의 루트 `templates/` 에 직접 추가**(neo4j-helm `templates/custom-service.yaml` 선례)로 보충한다.

## 시크릿

- **web**: 사내 표준 **Vault**(`vaultconfig` approle → `secrets.env` 마운트). DATABASE_URL·REDIS_URL·MINIO_*·LITELLM_MASTER_KEY·SESSION_SECRET.
- **litellm**(커스텀): `litellm-secrets`(ANTHROPIC_API_KEY·LITELLM_MASTER_KEY·DATABASE_URL) 참조.
  - local: `examPlatform.secrets.create=true` 로 평문 생성. **진짜 키는 `--set` 으로**(git values 금지).
  - alpha/prod: `create=false` → Vault/External Secrets 가 동명 `litellm-secrets` 제공.

## 사용법

### dependency 빌드 (사내망 필요 — harbor 인증)
```bash
helm dependency build      # common-helm 1.2.24 를 charts/ 로 받음 (oci://harbor-jinhak.jinhaksa.com/common)
```

### 렌더 검증
```bash
helm template catchup . -f prod-applications-values.yaml -f prod-ingress-values.yaml
```

### alpha/prod — ArgoCD (실 파이프라인)
`argocd/application.yaml` 의 `repoURL`·도메인·hostAliases IP·StorageClass·미러 CIDR 를 사내값으로 채워 적용.
회차 열기/닫기 = exam-ops 가 `batches/current.yaml` 의 `examPlatform.exam.replicas` 를 커밋 → ArgoCD auto-sync.

### local (k3d)
```bash
k3d cluster create catchup --agents 2
k3d image import catchup-web:local catchup-exam:local -c catchup
# 호스트 docker-compose 인프라(pnpm db:up) 재사용 → host.k3d.internal 로 참조 (local values 주석 참고)
helm template catchup . -f local-applications-values.yaml -f local-ingress-values.yaml \
  --set examPlatform.secrets.litellm.anthropicApiKey="sk-ant-..." | kubectl apply -f -
```

## ⚠️ 제약 / TODO

- **common-helm 1.2.24 는 사내 harbor 인증이 있어야 pull 가능** — 외부망에선 `helm dependency build` 불가.
  따라서 **web(common-helm) 부분은 형태만 catchairecruit 패턴에 맞췄고**, 실제 렌더·배포 검증은 사내에서 해야 한다.
  커스텀 `templates/`(litellm·exam·networkpolicy)는 dependency 없이 단독 렌더 검증 가능.
- 실값 교체: hostAliases IP·도메인·harbor 프로젝트·StorageClass·미러 CIDR·Vault kvPath.
- common-helm 의 `vaultconfig`·`ingress`·`applications.service` 스키마가 1.2.24 에서 우리가 가정한 형태와
  일치하는지 사내에서 1회 확인(로컬 참고본은 1.0.5).
- 실제 k3d 클러스터에서 exam pod iframe 프록시 검증 (Phase 2a 게이트, k3d 설치 후).
- bitbucket pipeline: `catchup` push → harbor → `image.tag` 자동 bump (Phase 2b).
