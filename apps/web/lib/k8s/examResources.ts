import 'server-only';
import { STORAGE_BUCKET } from '../storage';

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
  deployments: (ns: string) => `/apis/apps/v1/namespaces/${ns}/deployments`,
  // 플레인 경로(apply 용). 삭제 시엔 호출부가 ?propagationPolicy=Background 를 붙여 ReplicaSet/pod 까지 정리.
  deployment: (ns: string, name: string) => `/apis/apps/v1/namespaces/${ns}/deployments/${name}`,
  pods: (ns: string, labelSelector: string) =>
    `/api/v1/namespaces/${ns}/pods?labelSelector=${encodeURIComponent(labelSelector)}`,
} as const;

/** 슬롯 pod 의 클러스터 내부 endpoint(StatefulSet headless DNS). DB hosted.slots.endpoint 에 저장. */
export function slotEndpoint(ns: string, slotNo: number): string {
  return `http://${EXAM_STS}-${slotNo}.${EXAM_STS}.${ns}.svc.cluster.local:8080`;
}

/**
 * 슬롯별 IDE 서브도메인 호스트(webview 를 위한 subdomain 라우팅). code-server 가 루트로 서빙되어
 * webview service worker 가 올바른 scope·secure context(.localhost=loopback)에서 등록된다.
 * exam-authz 가 이 호스트의 N == 그 유저의 배정 슬롯을 대조해 격리(대원칙 ⑤). 세션 쿠키는 domain 공유로 전달.
 */
export function slotIdeHost(slotNo: number): string {
  return `slot${slotNo}.${IDE_HOST}`;
}

/**
 * seeder(initContainer)가 읽는 회차 ConfigMap — 이 회차의 문제 scaffold 목록.
 * ⭐ N문제: SCAFFOLD_MANIFEST 는 줄단위 `<폴더명>\t<ref>`(seq 순). seeder 가 순회하며
 *   각 scaffold 를 /ws/project/<폴더명>/ 로 시드한다(1번문제/2번문제). 단일 문제도 1줄로 동일 처리(0018).
 */
export function examBatchConfigMap(
  ns: string,
  input: { batchId: string; scaffoldManifest: string; model: string },
): Record<string, unknown> {
  return {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: { name: 'exam-batch', namespace: ns },
    data: {
      SCAFFOLD_MANIFEST: input.scaffoldManifest,
      BATCH_ID: input.batchId,
      // exam pod 가 envFrom 으로 흡수 → 활성 모델. 정적 env 는 템플릿에서 제거됨(envFrom 우선순위 함정 회피).
      ANTHROPIC_MODEL: input.model,
      ANTHROPIC_SMALL_FAST_MODEL: input.model,
    },
  };
}

/**
 * Claude Code 모델 피커 잠금 ConfigMap(managed-settings.json) — provision 이 회차마다 덮어쓴다.
 * exam pod 에 /etc/claude-code/managed-settings.json 으로 마운트되어 학생 IDE 의 switch-model 피커를
 * 회차 모델로 고정(enforceAvailableModels=true). ⚠️ scale-up 前에 apply 해야 새 pod 이 흡수한다.
 */
export function examClaudeConfigMap(ns: string, model: string): Record<string, unknown> {
  // T6: quota-hook.sh — UserPromptSubmit 마다 litellm 경유로 쿼터 조회. blocked=true 면 차단.
  // POSIX sh, jq 없음(python3 사용), curl --max-time 3, 모든 분기 exit 0(fail-open).
  // 차단 시만 stdout 출력 — 통과/실패는 빈 stdout(평문 출력 시 Claude context 오염).
  const quotaHookSh = `#!/bin/sh
ORD="\${HOSTNAME##*-}"
BATCH_ID="\${BATCH_ID:-}"
KEY="\$(cat /var/run/exam-keys/slot-\${ORD} 2>/dev/null)"

RESP="\$(curl -s --max-time 3 -X POST http://litellm:4000/quota \\
  -H "Authorization: Bearer \$KEY" \\
  -H 'content-type: application/json' \\
  -d "{\\"batchId\\":\\"\$BATCH_ID\\",\\"slotNo\\":\$ORD}" 2>/dev/null)"

python3 - <<'PYEOF'
import sys, os, json
resp = os.environ.get('QUOTA_RESP', '')
try:
    d = json.loads(resp)
    data = d.get('data', {})
    blocked = data.get('blocked', False)
    limit = data.get('limit', '')
    if blocked:
        msg = f"이 시험에서 사용할 수 있는 AI 대화 횟수({limit}회)를 모두 사용했습니다. 관리자에게 문의하세요." if limit != '' else "AI 대화 횟수 한도를 초과했습니다. 관리자에게 문의하세요."
        print(json.dumps({"decision": "block", "reason": msg}))
except Exception:
    pass
sys.exit(0)
PYEOF
exit 0
`;

  // QUOTA_RESP env를 python3에 전달하기 위해 export 래핑
  const quotaHookShFinal = `#!/bin/sh
ORD="\${HOSTNAME##*-}"
BATCH_ID="\${BATCH_ID:-}"
KEY="\$(cat /var/run/exam-keys/slot-\${ORD} 2>/dev/null)"

QUOTA_RESP="\$(curl -s --max-time 3 -X POST http://litellm:4000/quota \\
  -H "Authorization: Bearer \$KEY" \\
  -H 'content-type: application/json' \\
  -d "{\\"batchId\\":\\"\$BATCH_ID\\",\\"slotNo\\":\$ORD}" 2>/dev/null)"

export QUOTA_RESP

python3 - <<'PYEOF'
import sys, os, json
resp = os.environ.get('QUOTA_RESP', '')
try:
    d = json.loads(resp)
    data = d.get('data', {})
    blocked = data.get('blocked', False)
    limit = data.get('limit', '')
    if blocked:
        msg = (
            f"이 시험에서 사용할 수 있는 AI 대화 횟수({limit}회)를 모두 사용했습니다. 관리자에게 문의하세요."
            if limit != ''
            else "AI 대화 횟수 한도를 초과했습니다. 관리자에게 문의하세요."
        )
        print(json.dumps({"decision": "block", "reason": msg}))
except Exception:
    pass
sys.exit(0)
PYEOF
exit 0
`;

  return {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: { name: 'exam-claude-config', namespace: ns },
    data: {
      'managed-settings.json': JSON.stringify(
        {
          model,
          availableModels: [model],
          enforceAvailableModels: true,
          // T6: UserPromptSubmit 훅 — 쿼터 초과 시 차단, 조회 실패 시 fail-open.
          hooks: {
            UserPromptSubmit: [
              {
                hooks: [
                  {
                    type: 'command',
                    // subPath 마운트는 defaultMode(실행권한)를 무시하므로 sh 로 호출해 +x 의존을 없앤다.
                    command: 'sh /etc/claude-code/quota-hook.sh',
                    timeout: 5,
                  },
                ],
              },
            ],
          },
        },
        null,
        2,
      ),
      'quota-hook.sh': quotaHookShFinal,
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
 * 슬롯별 IDE Ingress — slotN.<host> → exam-slot-{N}(pod 고정 Service). ⭐ subdomain 라우팅:
 * 슬롯마다 별도 host rule 이라 code-server 가 루트로 서빙 → webview service worker 정상(subpath 문제 해소).
 * 미들웨어: exam-authz(ForwardAuth) 하나만 — stripPrefix 불필요(서브도메인 루트).
 * (인증은 exam-authz 가 X-Forwarded-Host 의 슬롯 번호 == 그 유저 배정 슬롯을 재판단.)
 */
export function slotsIngress(ns: string, slotCount: number): Record<string, unknown> {
  return {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
      name: 'exam-ide-slots',
      namespace: ns,
      annotations: {
        'traefik.ingress.kubernetes.io/router.middlewares': `${ns}-exam-authz@kubernetescrd`,
      },
    },
    spec: {
      ingressClassName: 'traefik',
      rules: Array.from({ length: slotCount }, (_, i) => ({
        host: slotIdeHost(i),
        http: {
          paths: [
            {
              path: '/',
              pathType: 'Prefix' as const,
              backend: { service: { name: `exam-slot-${i}`, port: { number: 8080 } } },
            },
          ],
        },
      })),
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
                  `mc cp /out/workspace.tgz "m/${STORAGE_BUCKET}/${artifactRef}"\n` +
                  `if [ -f /out/chatlog.tgz ]; then mc cp /out/chatlog.tgz "m/${STORAGE_BUCKET}/${chatRef}"; fi`,
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

/**
 * transcript 워처(슬롯별 장수 Deployment) — 그 슬롯 PVC 의 claude/ 세션 JSONL 을 readOnly 로 보다가
 * AI 가 한 턴을 끝내(사람에게 반환) 완료 횟수가 늘면 web `/api/internal/attempts/turn` 을 POST 한다. 근거: docs/10 §4.
 * 턴 종료 판정 = assistant 메시지 stop_reason 이 tool_use 가 아닌 것(end_turn 등). assistant 라인 수가 아니다(한 응답에 여러 개).
 * ⭐ 설계상 안전: ① MinIO 자격증명 없음(턴 신호만 — 실제 캡처는 snapshotJob) ② 학생 pod 밖 별도 워크로드
 *   (INTERNAL_API_SECRET 이 학생 컨테이너에 안 들어감) ③ podAffinity 로 exam-N 과 같은 노드(RWO readOnly 공동 마운트).
 * 식별: 가상키가 회차공유라 attempt 가 아니라 (batchId, slotNo)로 보낸다 → web 이 해소(턴 라우트). 폴링 5s — debounce 는 서버.
 */
export function slotWatcher(
  ns: string,
  input: { slotNo: number; batchId: string; pollSec?: number },
): Record<string, unknown> {
  const { slotNo, batchId, pollSec = 5 } = input;
  const name = `exam-watcher-${slotNo}`;
  // busybox sh 루프: "AI 가 사람에게 턴을 넘긴 완료 횟수"가 늘면 turn POST. LAST 로 새 턴만.
  // ⭐ 경계 신호 = assistant 메시지의 stop_reason 이 tool_use 가 *아닌* 것(end_turn/stop_sequence/max_tokens).
  //   Claude Code transcript 는 한 번의 응답에도 assistant 라인을 여러 개 쌓는다(텍스트+tool_use 블록마다).
  //   tool_use = "도구 쓰고 계속"(턴 중간), 그 외 = "끝, 사람 차례"(턴 종료). 그래서 stop_reason!=tool_use 만 센다.
  const loop =
    'set -u\n' +
    'LAST=0\n' +
    'echo "[watcher] slot=' +
    String(slotNo) +
    ' batch=' +
    batchId +
    ' start"\n' +
    'while true; do\n' +
    '  CNT=$(grep -rho \'"stop_reason":"[a-zA-Z_]*"\' /workspace/claude/projects 2>/dev/null | grep -vc \'"stop_reason":"tool_use"\')\n' +
    '  CNT=${CNT:-0}\n' +
    '  if [ "$CNT" -gt "$LAST" ]; then\n' +
    `    BODY="{\\"batchId\\":\\"${batchId}\\",\\"slotNo\\":${slotNo},\\"turnIndex\\":$CNT}"\n` +
    '    wget -q -O- --header "content-type: application/json" --header "x-internal-secret: $INTERNAL_API_SECRET" ' +
    `--post-data "$BODY" "http://web.${ns}.svc.cluster.local:3000/api/internal/attempts/turn" >/dev/null 2>&1 || true\n` +
    '    echo "[watcher] turn fired (assistant=$CNT)"\n' +
    '    LAST=$CNT\n' +
    '  fi\n' +
    `  sleep ${pollSec}\n` +
    'done';
  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name,
      namespace: ns,
      labels: { 'app.kubernetes.io/part-of': 'exam-watchers', app: 'exam-watcher', 'exam-slot': String(slotNo) },
    },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: 'exam-watcher', 'exam-slot': String(slotNo) } },
      template: {
        metadata: { labels: { app: 'exam-watcher', 'exam-slot': String(slotNo) } },
        spec: {
          securityContext: { runAsNonRoot: true, runAsUser: 1000, fsGroup: 1000 },
          // exam-{slotNo} 와 같은 노드 — RWO PVC 를 학생 pod 과 동시에 readOnly 마운트.
          affinity: {
            podAffinity: {
              requiredDuringSchedulingIgnoredDuringExecution: [
                {
                  labelSelector: {
                    matchLabels: { 'statefulset.kubernetes.io/pod-name': `${EXAM_STS}-${slotNo}` },
                  },
                  topologyKey: 'kubernetes.io/hostname',
                },
              ],
            },
          },
          containers: [
            {
              name: 'watcher',
              image: 'busybox:1.36',
              env: [
                {
                  name: 'INTERNAL_API_SECRET',
                  valueFrom: { secretKeyRef: { name: 'app-secrets', key: 'INTERNAL_API_SECRET' } },
                },
              ],
              command: ['sh', '-c', loop],
              resources: {
                requests: { cpu: '10m', memory: '32Mi' },
                limits: { cpu: '100m', memory: '64Mi' },
              },
              volumeMounts: [{ name: 'workspace', mountPath: '/workspace', readOnly: true }],
            },
          ],
          volumes: [
            {
              name: 'workspace',
              persistentVolumeClaim: { claimName: `workspace-${EXAM_STS}-${slotNo}`, readOnly: true },
            },
          ],
        },
      },
    },
  };
}

/**
 * 과정 스냅샷 Job — 시험 *진행 중* 그 슬롯의 PVC 를 readOnly 로 떠서 project/(작업물)만 tar+sha256 →
 * MinIO(exam-snapshots) → web internal 콜백으로 attempt_events(type='snapshot') 등록. 근거: docs/10 §7.
 * packagingJob 과 같은 패턴이되 차이: ① 대화(claude/)는 제외(별도 chatlog 파이프라인) ② 제외 패턴 적용
 * ③ ⭐ 학생 pod(exam-N)이 살아서 PVC 를 RW 로 잡고 있으므로 같은 노드에 강제 배치(podAffinity)해야
 *    RWO 를 readOnly 로 공동 마운트할 수 있다(제출 패키징은 pod 폐기 후라 불필요했다). ④ 짧은 TTL(스냅샷 多).
 * seq 는 클라가 안 보낸다 — 콜백 수신 측(snapshot route)이 부여(사전배정 race 제거). ref(타임스탬프 키)가 dedupe 키.
 */
export function snapshotJob(
  ns: string,
  input: {
    jobName: string;
    slotNo: number;
    attemptId: string;
    snapshotRef: string; // exam-snapshots/<dir>/<ts>.tgz (버킷 접두 포함 전체 키)
    trigger: string; // 'turn'
    turnField: string; // ',"turnIndex":N' 또는 '' (snapshotAttempt 가 만든 JSON 조각)
    excludeArgs: string; // "--exclude='node_modules/**' --exclude='.git/**' ..." (admin 신뢰 소스)
  },
): Record<string, unknown> {
  const { jobName, slotNo, attemptId, snapshotRef, trigger, turnField, excludeArgs } = input;
  return {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: { name: jobName, namespace: ns, labels: { 'app.kubernetes.io/part-of': 'exam-snapshots' } },
    spec: {
      backoffLimit: 1, // 스냅샷은 자주 — 실패해도 다음 턴이 또 찍는다. 끈질긴 재시도 불필요.
      ttlSecondsAfterFinished: 600, // 완료 후 빠르게 정리(누적 방지).
      template: {
        metadata: { labels: { app: 'exam-snapshotter' } },
        spec: {
          restartPolicy: 'Never',
          securityContext: { runAsNonRoot: true, runAsUser: 1000, fsGroup: 1000 },
          // ⭐ exam-{slotNo} 와 같은 노드에 강제 — RWO PVC 를 학생 pod 과 동시에(readOnly) 마운트하려면 동일 노드여야 한다.
          affinity: {
            podAffinity: {
              requiredDuringSchedulingIgnoredDuringExecution: [
                {
                  labelSelector: {
                    matchLabels: { 'statefulset.kubernetes.io/pod-name': `${EXAM_STS}-${slotNo}` },
                  },
                  topologyKey: 'kubernetes.io/hostname',
                },
              ],
            },
          },
          initContainers: [
            {
              name: 'pack',
              image: 'busybox:1.36',
              command: [
                'sh',
                '-c',
                'set -e\n' +
                  'SRC=/workspace/project\n' +
                  '[ -d "$SRC" ] || SRC=/workspace\n' +
                  `tar -czf /out/snap.tgz ${excludeArgs} -C "$SRC" .\n` +
                  'sha256sum /out/snap.tgz | cut -d" " -f1 > /out/sha256\n' +
                  'wc -c < /out/snap.tgz | tr -d " " > /out/size\n' +
                  'tar -tzf /out/snap.tgz | grep -vc "/$" > /out/fc 2>/dev/null || echo 0 > /out/fc\n' +
                  'echo "[snap] $(cat /out/sha256) $(cat /out/size)B files=$(cat /out/fc)"',
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
                  `mc cp /out/snap.tgz "m/${STORAGE_BUCKET}/${snapshotRef}"`,
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
                { name: 'REF', value: snapshotRef },
                { name: 'TRIGGER', value: trigger },
                {
                  name: 'INTERNAL_API_SECRET',
                  valueFrom: { secretKeyRef: { name: 'app-secrets', key: 'INTERNAL_API_SECRET' } },
                },
              ],
              command: [
                'sh',
                '-c',
                'set -e\n' +
                  'SHA=$(cat /out/sha256); SIZE=$(cat /out/size); FC=$(cat /out/fc)\n' +
                  `BODY="{\\"attemptId\\":\\"$ATTEMPT_ID\\",\\"ref\\":\\"$REF\\",\\"sha256\\":\\"$SHA\\",\\"sizeBytes\\":$SIZE,\\"trigger\\":\\"$TRIGGER\\",\\"fileCount\\":$FC${turnField}}"\n` +
                  'wget -q -O- --header "content-type: application/json" --header "x-internal-secret: $INTERNAL_API_SECRET" ' +
                  `--post-data "$BODY" "http://web.${ns}.svc.cluster.local:3000/api/internal/attempts/snapshot"`,
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
