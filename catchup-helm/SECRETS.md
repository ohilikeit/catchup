# catchup-helm — 시크릿 (alpha/prod, Phase 2b)

로컬(k3d)은 평문 `.env.secret` → `setup.sh` 가 클러스터 Secret 을 렌더한다(docs/6 §0.5).
**alpha/prod 는 git 평문 금지** — SealedSecrets(또는 사내 Vault/External Secrets)로 같은 이름의 Secret 을 제공한다.
values 의 `examPlatform.secrets.create=false` 로 두면 chart 는 Secret 을 만들지 않고 *참조만* 한다.

## 제공해야 할 Secret (이름·키는 로컬과 동일)

| Secret | 키 | 소비자 |
|---|---|---|
| `litellm-secrets` | `ANTHROPIC_API_KEY`(진짜 키)·`LITELLM_MASTER_KEY`·`DATABASE_URL`(litellm DB) | litellm pod |
| `app-secrets` | `DATABASE_URL`·`REDIS_URL`·`MINIO_*`·`SESSION_SECRET`·`INTERNAL_API_SECRET`·`POSTGRES_*` | web·(외부 인프라 참조 시) |

> web 은 사내 표준상 Vault(approle → `secrets.env` 마운트)로 받을 수도 있다(catchup-helm/README "시크릿" 참조).
> postgres/redis/minio 는 alpha/prod 에선 **사내 기존 인스턴스를 hostAliases 로 참조**(chart 가 배포하지 않음).

## SealedSecrets 봉인 절차 (예)

```bash
# 1) 평문 Secret 을 만든다(클러스터에 apply 하지 않음, stdout 으로만).
kubectl create secret generic litellm-secrets -n ait-catch-alpha \
  --from-literal=ANTHROPIC_API_KEY="sk-ant-..." \
  --from-literal=LITELLM_MASTER_KEY="$(openssl rand -base64 24)" \
  --from-literal=DATABASE_URL="postgresql://litellm:***@<사내 pg>:5432/litellm" \
  --dry-run=client -o yaml > /tmp/litellm-secrets.yaml

# 2) 클러스터의 sealed-secrets 컨트롤러 공개키로 봉인 → git 안전.
kubeseal --controller-namespace kube-system --format yaml \
  < /tmp/litellm-secrets.yaml > sealed/litellm-secrets.sealed.yaml

# 3) sealed/*.sealed.yaml 만 catchup-helm 에 커밋 → ArgoCD 가 apply → 컨트롤러가 평문 Secret 으로 복호화.
```

`app-secrets` 도 동일하게 봉인한다. **봉인 전 평문(.yaml)·진짜 키는 절대 커밋 금지.** 채팅/로그 노출 시 즉시 로테이션(docs/6 횡단원칙).

## 주의
- `kubeseal` 봉인은 **대상 클러스터의 컨트롤러 공개키**에 묶인다 — alpha·prod 각각 따로 봉인.
- 키 로테이션 = 새로 봉인 후 커밋 → ArgoCD sync. exam pod 의 가상키는 exam-ops 가 회차마다 발급(여기 시크릿과 별개, Phase 3).
