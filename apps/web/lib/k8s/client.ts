import 'server-only';
import { readFileSync, existsSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';

// k8s 최소 클라이언트 — in-cluster ServiceAccount 자격으로 k8s API 를 직접 호출(의존성 0).
// 근거: docs/6 Phase 3(exam-ops 자동화, 로컬은 k8s API 직접 / alpha+는 GitOps 커밋 — §5.4).
// ⭐ 풀(cold) 전용: 회차 provision/close·패키징 Job 등 관리자 단위 사건에만 쓴다.
//    학생 슬롯 배정(hot path)은 DB 트랜잭션이며 이 모듈을 절대 거치지 않는다(docs/2 §5·§6).

const SA_DIR = '/var/run/secrets/kubernetes.io/serviceaccount';

let cached: { token: string; ca: Buffer; namespace: string } | null = null;

function loadServiceAccount(): { token: string; ca: Buffer; namespace: string } {
  if (cached) return cached;
  cached = {
    token: readFileSync(`${SA_DIR}/token`, 'utf8').trim(),
    ca: readFileSync(`${SA_DIR}/ca.crt`),
    namespace: readFileSync(`${SA_DIR}/namespace`, 'utf8').trim(),
  };
  return cached;
}

/** pod 안(ServiceAccount 마운트 존재)에서 실행 중인가. 아니면 exam-ops 기능은 명시적 에러로 비활성. */
export function inCluster(): boolean {
  return existsSync(`${SA_DIR}/token`) && !!process.env.KUBERNETES_SERVICE_HOST;
}

/** 현재 pod 의 네임스페이스(리소스 경로 구성용). */
export function k8sNamespace(): string {
  return loadServiceAccount().namespace;
}

export interface K8sResponse {
  status: number;
  body: unknown;
}

/**
 * k8s API 원시 호출. fetch 대신 node:https 를 쓰는 이유: 클러스터 CA(ca.crt)를 요청 단위로
 * 신뢰시켜야 하는데 undici fetch 는 ca 옵션이 없다(전역 TLS 무력화는 금지).
 */
export function k8sRequest(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  contentType = 'application/json',
): Promise<K8sResponse> {
  const { token, ca } = loadServiceAccount();
  const host = process.env.KUBERNETES_SERVICE_HOST!;
  const port = Number(process.env.KUBERNETES_SERVICE_PORT_HTTPS ?? process.env.KUBERNETES_SERVICE_PORT ?? 443);
  const payload = body === undefined ? null : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        host,
        port,
        path,
        method,
        ca,
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
          ...(payload ? { 'content-type': contentType, 'content-length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed: unknown = text;
          try {
            parsed = text ? JSON.parse(text) : null;
          } catch {
            /* 비 JSON 응답은 원문 유지 */
          }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** k8s 에러 메시지 추출(Status 객체의 message). */
function k8sErrorMessage(res: K8sResponse): string {
  const b = res.body as { message?: string } | null;
  return b && typeof b.message === 'string' ? b.message : `HTTP ${res.status}`;
}

/**
 * Server-Side Apply — create-or-update 를 한 호출로(멱등). manifest 에 apiVersion/kind/metadata.name 필수.
 * ArgoCD 추적 대상이 아닌(git 에 없는) 동적 리소스에만 쓴다 — selfHeal 과 충돌하지 않는 경계.
 */
export async function applyObject(resourcePath: string, manifest: Record<string, unknown>): Promise<void> {
  const sep = resourcePath.includes('?') ? '&' : '?';
  const res = await k8sRequest(
    'PATCH',
    `${resourcePath}${sep}fieldManager=catchup-exam-ops&force=true`,
    manifest,
    'application/apply-patch+yaml',
  );
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`k8s apply 실패(${resourcePath}): ${k8sErrorMessage(res)}`);
  }
}

/** 객체 삭제(404 는 성공으로 간주 — 멱등). */
export async function deleteObject(resourcePath: string): Promise<void> {
  const res = await k8sRequest('DELETE', resourcePath);
  if (res.status === 404) return;
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`k8s delete 실패(${resourcePath}): ${k8sErrorMessage(res)}`);
  }
}

/** GET(404 → null). */
export async function getObject(resourcePath: string): Promise<unknown | null> {
  const res = await k8sRequest('GET', resourcePath);
  if (res.status === 404) return null;
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`k8s get 실패(${resourcePath}): ${k8sErrorMessage(res)}`);
  }
  return res.body;
}

/** StatefulSet scale 서브리소스 patch(ArgoCD ignoreDifferences 로 드리프트 무시됨 — argocd-application.yaml). */
export async function scaleStatefulSet(ns: string, name: string, replicas: number): Promise<void> {
  const res = await k8sRequest(
    'PATCH',
    `/apis/apps/v1/namespaces/${ns}/statefulsets/${name}/scale`,
    { spec: { replicas } },
    'application/merge-patch+json',
  );
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`statefulset scale 실패(${name}→${replicas}): ${k8sErrorMessage(res)}`);
  }
}

interface K8sList {
  items?: Array<{ metadata?: { name?: string } }>;
}

/** 컬렉션에서 이름 prefix 로 필터한 이름 목록. */
export async function listNamesByPrefix(collectionPath: string, prefix: string): Promise<string[]> {
  const body = (await getObject(collectionPath)) as K8sList | null;
  if (!body?.items) return [];
  return body.items
    .map((i) => i.metadata?.name ?? '')
    .filter((n) => n.startsWith(prefix));
}

/** 조건이 참이 될 때까지 폴링(간격 2s). 타임아웃이면 false. */
export async function waitFor(
  check: () => Promise<boolean>,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await check()) return true;
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, 2000));
  }
}
