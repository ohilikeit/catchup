import 'server-only';

// exam 동적 k8s 리소스 빌더 — provision/close/패키징이 만들고 지우는 오브젝트의 단일 정의처.
// 근거: docs/2 §6(슬롯별 라우팅·격리), docs/5 §4(패키징 Job), docs/6 Phase 3.
// ⚠️ 여기서 만드는 리소스는 전부 git(deploy/local-k3d)에 없는 동적 오브젝트다 —
//    ArgoCD 가 추적하지 않으므로 selfHeal/prune 과 충돌하지 않는다(정적 manifest 에 같은 이름 금지).

export const EXAM_STS = 'exam'; // StatefulSet/headless Service 이름(40-exam.yaml)
const IDE_HOST = process.env.EXAM_IDE_HOST ?? 'catchup.localhost';

export const paths = {
  configMap: (ns: string, name: string) => `/api/v1/namespaces/${ns}/configmaps/${name}`,
  secret: (ns: string, name: string) => `/api/v1/namespaces/${ns}/secrets/${name}`,
  service: (ns: string, name: string) => `/api/v1/namespaces/${ns}/services/${name}`,
  services: (ns: string) => `/api/v1/namespaces/${ns}/services`,
  ingress: (ns: string, name: string) => `/apis/networking.k8s.io/v1/namespaces/${ns}/ingresses/${name}`,
  jobs: (ns: string) => `/apis/batch/v1/namespaces/${ns}/jobs`,
  // ⚠️ Job 삭제는 propagation=Background 필수 — 기본(orphan)이면 완료된 pod이 남아 PVC 삭제를 막는다.
  job: (ns: string, name: string) =>
    `/apis/batch/v1/namespaces/${ns}/jobs/${name}?propagationPolicy=Background`,
  pvc: (ns: string, name: string) => `/api/v1/namespaces/${ns}/persistentvolumeclaims/${name}`,
  pvcs: (ns: string) => `/api/v1/namespaces/${ns}/persistentvolumeclaims`,
  pods: (ns: string, labelSelector: string) =>
    `/api/v1/namespaces/${ns}/pods?labelSelector=${encodeURIComponent(labelSelector)}`,
} as const;

/** 슬롯 pod 의 클러스터 내부 endpoint(StatefulSet headless DNS). DB hosted.slots.endpoint 에 저장. */
export function slotEndpoint(ns: string, slotNo: number): string {
  return `http://${EXAM_STS}-${slotNo}.${EXAM_STS}.${ns}.svc.cluster.local:8080`;
}

/** 학생 브라우저가 쓰는 슬롯별 IDE 경로(같은 도메인 → 세션 쿠키 전달, ForwardAuth 검사 가능). */
export function slotIdePath(slotNo: number): string {
  return `/exam-ide/${slotNo}`;
}

/** seeder(initContainer)가 읽는 회차 ConfigMap — 이 회차의 문제 scaffold 객체 키. */
export function examBatchConfigMap(
  ns: string,
  input: { batchId: string; scaffoldRef: string; problemCode: string },
): Record<string, unknown> {
  return {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: { name: 'exam-batch', namespace: ns },
    data: {
      SCAFFOLD_REF: input.scaffoldRef,
      PROBLEM_ID: input.problemCode,
      BATCH_ID: input.batchId,
    },
  };
}

/**
 * 슬롯별 가상키 Secret — pod 가 자기 ordinal(slot-N)에 해당하는 키만 읽어 ANTHROPIC_AUTH_TOKEN 으로 export.
 * (40-exam.yaml 기동 래퍼 참고. 키는 게이트웨이 발급 예산제 가상키 — 진짜 키는 게이트웨이에만.)
 */
export function virtualKeysSecret(ns: string, keys: string[]): Record<string, unknown> {
  const stringData: Record<string, string> = {};
  keys.forEach((k, i) => {
    stringData[`slot-${i}`] = k;
  });
  return {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: { name: 'exam-virtual-keys', namespace: ns },
    type: 'Opaque',
    stringData,
  };
}

/**
 * 슬롯별 Service — StatefulSet pod 1개를 정확히 지정(statefulset.kubernetes.io/pod-name 라벨).
 * ⭐ 이게 per-student 격리의 핵심: app=exam 라운드로빈이 아니라 슬롯 N → pod exam-N 고정.
 */
export function slotService(ns: string, slotNo: number): Record<string, unknown> {
  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: `exam-slot-${slotNo}`, namespace: ns, labels: { 'app.kubernetes.io/part-of': 'exam-slots' } },
    spec: {
      selector: { 'statefulset.kubernetes.io/pod-name': `${EXAM_STS}-${slotNo}` },
      ports: [{ port: 8080, targetPort: 8080 }],
    },
  };
}

/**
 * 슬롯별 IDE Ingress — /exam-ide/{N} → exam-slot-{N}.
 * 미들웨어 순서: exam-authz(ForwardAuth: 세션 + 그 유저의 배정 슬롯 == N 검사) → exam-stripprefix(접두 제거).
 * 둘 다 55-exam-ide.yaml 의 정적 Middleware(이름이 ns 접두로 참조됨).
 */
export function slotsIngress(ns: string, slotCount: number): Record<string, unknown> {
  return {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
      name: 'exam-ide-slots',
      namespace: ns,
      annotations: {
        'traefik.ingress.kubernetes.io/router.middlewares': `${ns}-exam-authz@kubernetescrd,${ns}-exam-stripprefix@kubernetescrd`,
      },
    },
    spec: {
      ingressClassName: 'traefik',
      rules: [
        {
          host: IDE_HOST,
          http: {
            paths: Array.from({ length: slotCount }, (_, i) => ({
              path: slotIdePath(i),
              pathType: 'Prefix' as const,
              backend: { service: { name: `exam-slot-${i}`, port: { number: 8080 } } },
            })),
          },
        },
      ],
    },
  };
}

/**
 * 패키징 Job — 제출(자가/강제) 시 그 슬롯의 PVC 를 readOnly 로 떠서 tar+sha256 → MinIO 업로드 →
 * web internal 콜백으로 DB 등록(submission_files). docs/5 §4 "서버측 패키징".
 * 단계는 initContainer 순차 실행: pack(busybox) → upload(mc) → report(main, busybox wget 콜백).
 * ⭐ 이중 캡처: project/(작업물)→artifactRef, claude/(대화 JSONL)→chatRef(있을 때만).
 *   ref 는 버킷 접두 포함 전체 키(`exam-artifacts/...`) — 사람이 읽는 경로는 호출부가 만든다.
 */
export function packagingJob(
  ns: string,
  input: { jobName: string; slotNo: number; attemptId: string; artifactRef: string; chatRef: string },
): Record<string, unknown> {
  const { jobName, slotNo, attemptId, artifactRef, chatRef } = input;
  return {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: { name: jobName, namespace: ns, labels: { 'app.kubernetes.io/part-of': 'exam-packaging' } },
    spec: {
      backoffLimit: 2,
      ttlSecondsAfterFinished: 3600,
      template: {
        metadata: { labels: { app: 'exam-packager' } },
        spec: {
          restartPolicy: 'Never',
          securityContext: { runAsNonRoot: true, runAsUser: 1000, fsGroup: 1000 },
          initContainers: [
            {
              name: 'pack',
              image: 'busybox:1.36',
              command: [
                'sh',
                '-c',
                // PVC를 서버가 직접 캡처 — trust=verified 의 근거(클라 업로드 아님).
                // project/=작업물, claude/=대화 JSONL(있을 때만). 구버전 PVC(루트 직저장)도 호환.
                'set -e\n' +
                  'SRC=/workspace/project\n' +
                  '[ -d "$SRC" ] || SRC=/workspace\n' +
                  'tar -czf /out/workspace.tgz -C "$SRC" .\n' +
                  'sha256sum /out/workspace.tgz | cut -d" " -f1 > /out/sha256\n' +
                  'wc -c < /out/workspace.tgz | tr -d " " > /out/size\n' +
                  'echo "[pack] ws $(cat /out/sha256) $(cat /out/size)B"\n' +
                  'if [ -d /workspace/claude ] && [ -n "$(ls -A /workspace/claude 2>/dev/null)" ]; then\n' +
                  '  tar -czf /out/chatlog.tgz -C /workspace/claude .\n' +
                  '  sha256sum /out/chatlog.tgz | cut -d" " -f1 > /out/chat_sha256\n' +
                  '  wc -c < /out/chatlog.tgz | tr -d " " > /out/chat_size\n' +
                  '  echo "[pack] chat $(cat /out/chat_sha256) $(cat /out/chat_size)B"\n' +
                  'else\n' +
                  '  echo "[pack] 채팅 로그 없음(claude/ 비어있음)"\n' +
                  'fi',
              ],
              volumeMounts: [
                { name: 'workspace', mountPath: '/workspace', readOnly: true },
                { name: 'out', mountPath: '/out' },
              ],
            },
            {
              name: 'upload',
              image: 'minio/mc:latest',
              env: [{ name: 'HOME', value: '/tmp' }],
              envFrom: [{ secretRef: { name: 'app-secrets' } }],
              command: [
                '/bin/sh',
                '-c',
                'set -e\n' +
                  'mc alias set m "http://${MINIO_ENDPOINT}:${MINIO_PORT}" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" >/dev/null\n' +
                  `mc cp /out/workspace.tgz "m/${artifactRef}"\n` +
                  `if [ -f /out/chatlog.tgz ]; then mc cp /out/chatlog.tgz "m/${chatRef}"; fi`,
              ],
              volumeMounts: [{ name: 'out', mountPath: '/out' }],
            },
          ],
          containers: [
            {
              name: 'report',
              image: 'busybox:1.36',
              env: [
                { name: 'ATTEMPT_ID', value: attemptId },
                { name: 'REF', value: artifactRef },
                { name: 'CHAT_REF', value: chatRef },
                {
                  name: 'INTERNAL_API_SECRET',
                  valueFrom: { secretKeyRef: { name: 'app-secrets', key: 'INTERNAL_API_SECRET' } },
                },
              ],
              command: [
                'sh',
                '-c',
                'set -e\n' +
                  'SHA=$(cat /out/sha256); SIZE=$(cat /out/size)\n' +
                  'CHAT=null\n' +
                  'if [ -f /out/chat_sha256 ]; then\n' +
                  '  CHAT="{\\"ref\\":\\"$CHAT_REF\\",\\"sha256\\":\\"$(cat /out/chat_sha256)\\",\\"sizeBytes\\":$(cat /out/chat_size)}"\n' +
                  'fi\n' +
                  'BODY="{\\"attemptId\\":\\"$ATTEMPT_ID\\",\\"ref\\":\\"$REF\\",\\"sha256\\":\\"$SHA\\",\\"sizeBytes\\":$SIZE,\\"chat\\":$CHAT}"\n' +
                  'wget -q -O- --header "content-type: application/json" --header "x-internal-secret: $INTERNAL_API_SECRET" ' +
                  `--post-data "$BODY" "http://web.${ns}.svc.cluster.local:3000/api/internal/submissions/package"`,
              ],
              volumeMounts: [{ name: 'out', mountPath: '/out' }],
            },
          ],
          volumes: [
            {
              name: 'workspace',
              persistentVolumeClaim: { claimName: `workspace-${EXAM_STS}-${slotNo}`, readOnly: true },
            },
            { name: 'out', emptyDir: {} },
          ],
        },
      },
    },
  };
}
