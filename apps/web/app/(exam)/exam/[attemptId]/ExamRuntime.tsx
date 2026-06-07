'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Notification, Tag, Icon, Modal } from '@app/ui';
import { Countdown } from '../../_components/Countdown';
import { Card, ComingSoon } from '../../_components/ExamChrome';

// ⭐ delivery_mode 분기는 여기 한 곳(docs/1 §4·§5). 부모(page.tsx 서버)가 status='running'만 통과시킨다.
// runtime은 서버에서 plain 직렬화해 전달(Date → ISO 문자열).

export interface ExamRuntimeData {
  attemptId: string;
  deliveryMode: 'hosted' | 'byod';
  deadlineAt: string | null;
  problemTitle: string;
  batchName: string;
  publicScaffoldRef: string;
  scaffoldSha256: string;
}

export function ExamRuntime({ runtime }: { runtime: ExamRuntimeData }) {
  return runtime.deliveryMode === 'hosted' ? (
    <HostedRuntime runtime={runtime} />
  ) : (
    <ByodRuntime runtime={runtime} />
  );
}

/* ── hosted: 웹 IDE iframe 자리표시(이번 범위에서 백엔드 미구현) ──────────────── */
function HostedRuntime({ runtime }: { runtime: ExamRuntimeData }) {
  const [expired, setExpired] = useState(false);
  return (
    <div className="flex flex-col gap-06">
      <RuntimeHeader
        runtime={runtime}
        onExpire={() => setExpired(true)}
        right={<Tag color="purple">호스팅</Tag>}
      />

      {/* iframe 래퍼 박스 모양만(실제 IDE는 호스팅 어댑터 연동 후). */}
      <div className="bg-layer-02 border border-border-subtle-01">
        <div className="border-b border-border-subtle-01 px-05 py-03 flex items-center gap-02">
          <span className="text-icon-secondary">
            <Icon name="data" size={16} />
          </span>
          <span className="cds-helper-01 text-text-secondary">웹 IDE</span>
        </div>
        <div className="px-06">
          <ComingSoon
            icon="time"
            title="호스팅 환경은 준비 중입니다"
            message="브라우저 안에서 바로 풀 수 있는 호스팅 IDE를 준비하고 있습니다. 현재 회차는 담당자 안내를 따르세요."
          />
        </div>
      </div>

      {expired ? (
        <Notification kind="warning" title="제한시간이 지났습니다">
          제출 가능 시간이 종료되었습니다. 최종 처리는 서버 기준으로 판정됩니다.
        </Notification>
      ) : null}

      <div className="flex justify-end">
        <Button kind="primary" icon="checkmark" disabled>
          제출
        </Button>
      </div>
    </div>
  );
}

/* ── byod: scaffold 다운로드 + 업로드 폼 ──────────────────────────────────── */
const PER_FILE_MAX = 25 * 1024 * 1024; // 25MB/파일(클라 사전 가드 — 서버가 최종 판정)

interface ChatPreview {
  messages: number;
  tool: string | null;
  source: string | null;
  attemptId: string | null;
}

function derivePreview(log: unknown): ChatPreview | null {
  if (!log || typeof log !== 'object') return null;
  const o = log as Record<string, unknown>;
  const meta = (o.meta && typeof o.meta === 'object' ? o.meta : {}) as Record<string, unknown>;
  return {
    messages: Array.isArray(o.messages) ? o.messages.length : 0,
    tool: typeof o.tool === 'string' ? o.tool : null,
    source: typeof meta.source === 'string' ? meta.source : null,
    attemptId: typeof meta.attemptId === 'string' ? meta.attemptId : null,
  };
}

function ByodRuntime({ runtime }: { runtime: ExamRuntimeData }) {
  const router = useRouter();
  const [expired, setExpired] = useState(false);
  const [chatFile, setChatFile] = useState<File | null>(null);
  const [chatLog, setChatLog] = useState<unknown>(null);
  const [preview, setPreview] = useState<ChatPreview | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<File[]>([]);
  const [sizeWarning, setSizeWarning] = useState<string | null>(null);
  const [tool, setTool] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [details, setDetails] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function onChatSelected(file: File | null) {
    setChatFile(file);
    setChatLog(null);
    setPreview(null);
    setParseError(null);
    if (!file) return;
    if (file.size > PER_FILE_MAX) {
      setParseError(`대화 로그가 너무 큽니다(${formatBytes(file.size)}). 25MB 이하여야 합니다.`);
      return;
    }
    try {
      const parsed = JSON.parse(await file.text());
      setChatLog(parsed);
      const p = derivePreview(parsed);
      setPreview(p);
      if (p?.tool && !tool) setTool(p.tool); // 도구 자동 채움(수정 가능)
    } catch {
      setParseError('JSON 파싱에 실패했습니다. 내보내기 스크립트가 만든 정규화 대화 로그(.json)인지 확인하세요.');
    }
  }

  function addArtifacts(files: FileList | null) {
    if (!files) return;
    const incoming = Array.from(files);
    const tooBig = incoming.filter((f) => f.size > PER_FILE_MAX);
    const okFiles = incoming.filter((f) => f.size <= PER_FILE_MAX);
    setSizeWarning(
      tooBig.length > 0 ? `${tooBig.map((f) => f.name).join(', ')} — 25MB 초과로 제외됨` : null,
    );
    // 이름 기준 병합(중복 교체)
    setArtifacts((prev) => {
      const map = new Map(prev.map((f) => [f.name, f]));
      okFiles.forEach((f) => map.set(f.name, f));
      return Array.from(map.values());
    });
  }

  function removeArtifact(name: string) {
    setArtifacts((prev) => prev.filter((f) => f.name !== name));
  }

  const attemptMismatch = preview?.attemptId != null && preview.attemptId !== runtime.attemptId;
  const canSubmit =
    !expired && !submitting && chatFile !== null && chatLog !== null && parseError === null;

  async function submit() {
    setConfirmOpen(false);
    if (!chatFile || chatLog === null) return;
    setSubmitting(true);
    setSubmitError(null);
    setDetails([]);
    try {
      const files = [
        await toFileInput(chatFile, 'chat_log'),
        ...(await Promise.all(artifacts.map((f) => toFileInput(f, 'artifact')))),
      ];
      const res = await fetch(`/api/exam/${runtime.attemptId}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chatLog, files, tool: tool.trim() || null }),
      });
      const body = await res.json();
      if (res.ok && body?.success) {
        router.push(`/exam/${runtime.attemptId}/done`);
        return;
      }
      setSubmitError(body?.error?.message ?? '제출에 실패했습니다.');
      setDetails(Array.isArray(body?.details) ? body.details : []);
      setSubmitting(false);
    } catch {
      setSubmitError('네트워크 오류로 제출에 실패했습니다. 다시 시도하세요.');
      setSubmitting(false);
    }
  }

  const isDownloadable = /^https?:/i.test(runtime.publicScaffoldRef);

  return (
    <div className="flex flex-col gap-06">
      <RuntimeHeader
        runtime={runtime}
        onExpire={() => setExpired(true)}
        right={<Tag color="teal">BYOD</Tag>}
      />

      {/* ① scaffold 다운로드 영역 */}
      <Card>
        <h2 className="cds-heading-compact-02 text-text-primary mb-01">시작 파일</h2>
        <p className="cds-body-01 text-text-secondary mb-04">
          아래 골격을 내려받아 본인 PC에서 풀이한 뒤, 내보내기 스크립트로 추출한 대화 로그와 산출물을 제출하세요.
        </p>
        <div className="flex items-center justify-between gap-04 border border-border-subtle-01 bg-layer-01 px-05 py-04">
          <div className="min-w-0">
            <div className="cds-body-compact-01 text-text-primary truncate">{runtime.publicScaffoldRef}</div>
            <div className="cds-code-01 text-text-secondary truncate">sha256:{runtime.scaffoldSha256}</div>
          </div>
          {isDownloadable ? (
            <Button kind="tertiary" icon="arrow-down" asChild>
              <a href={runtime.publicScaffoldRef} download>내려받기</a>
            </Button>
          ) : (
            <Button kind="tertiary" icon="arrow-down" disabled>준비 중</Button>
          )}
        </div>
      </Card>

      {/* ② 업로드 폼 */}
      <Card>
        <h2 className="cds-heading-compact-02 text-text-primary mb-04">제출물 업로드</h2>
        <div className="flex flex-col gap-05">
          <Field label="정규화 대화 로그 (.json)">
            <input
              type="file"
              accept="application/json,.json"
              className="block w-full cds-body-01 text-text-secondary file:mr-04 file:border file:border-border-strong-01 file:bg-layer-01 file:px-04 file:py-02 file:text-sm file:text-text-primary"
              onChange={(e) => onChatSelected(e.target.files?.[0] ?? null)}
            />
          </Field>

          {/* 대화 로그 미리보기 요약(올바른 파일인지 사전 확인) */}
          {preview ? (
            <div className="border border-border-subtle-01 bg-layer-01 px-05 py-04 flex flex-col gap-02">
              <div className="flex items-center gap-02 cds-helper-01 text-support-success">
                <Icon name="checkmark-filled" size={16} />
                <span>{chatFile?.name} 읽기 완료</span>
              </div>
              <div className="flex flex-wrap gap-02">
                <Tag color="gray">메시지 {preview.messages}개</Tag>
                {preview.tool ? <Tag color="gray">{preview.tool}</Tag> : null}
                {preview.source ? <Tag color="gray">{preview.source}</Tag> : null}
              </div>
              {attemptMismatch ? (
                <span className="cds-helper-01 text-support-error">
                  이 로그의 attemptId가 현재 시험과 다릅니다. 다른 시험의 파일이 아닌지 확인하세요(제출 시 서버가 거부합니다).
                </span>
              ) : null}
            </div>
          ) : null}
          {parseError ? (
            <Notification kind="error" title="대화 로그를 읽을 수 없습니다">
              {parseError}
            </Notification>
          ) : null}

          <Field label="산출물 (여러 개 선택 가능)">
            <input
              type="file"
              multiple
              className="block w-full cds-body-01 text-text-secondary file:mr-04 file:border file:border-border-strong-01 file:bg-layer-01 file:px-04 file:py-02 file:text-sm file:text-text-primary"
              onChange={(e) => addArtifacts(e.target.files)}
            />
          </Field>
          {sizeWarning ? (
            <span className="cds-helper-01 text-support-warning">{sizeWarning}</span>
          ) : null}
          {artifacts.length > 0 ? (
            <ul className="flex flex-col gap-01">
              {artifacts.map((f) => (
                <li key={f.name} className="flex items-center gap-02 px-03 py-02 bg-layer-01 border border-border-subtle-01">
                  <Icon name="document" size={16} />
                  <span className="truncate cds-helper-01 text-text-primary flex-1">{f.name}</span>
                  <span className="cds-helper-01 text-text-placeholder">{formatBytes(f.size)}</span>
                  <Button kind="ghost" size="sm" iconOnly icon="close" aria-label={`${f.name} 제거`} onClick={() => removeArtifact(f.name)} />
                </li>
              ))}
            </ul>
          ) : null}

          <Field label="사용한 도구 (선택)">
            <Input
              placeholder="예: cursor, claude-code"
              value={tool}
              onChange={(e) => setTool(e.target.value)}
            />
          </Field>
        </div>
      </Card>

      {/* ③ 제출 결과(에러·검증 details) */}
      {expired ? (
        <Notification kind="warning" title="제한시간이 지났습니다">
          제출 가능 시간이 종료되었습니다. 제출은 서버에서 거부될 수 있습니다.
        </Notification>
      ) : null}
      {submitError ? (
        <Notification kind="error" title="제출 실패">
          <div className="flex flex-col gap-02">
            <span>{submitError}</span>
            {details.length > 0 ? (
              <ul className="list-disc pl-05 flex flex-col gap-01">
                {details.map((d, i) => (
                  <li key={i} className="cds-helper-01">
                    {d}
                  </li>
                ))}
              </ul>
            ) : null}
            <span className="cds-helper-01 text-text-secondary">
              파일을 고친 뒤 다시 제출할 수 있습니다.
            </span>
          </div>
        </Notification>
      ) : null}

      <div className="flex justify-end">
        <Button kind="primary" icon="checkmark" disabled={!canSubmit} onClick={() => setConfirmOpen(true)}>
          {submitting ? '제출하는 중…' : '제출'}
        </Button>
      </div>

      {/* ④ 제출 확인(되돌릴 수 없음) */}
      {confirmOpen ? (
        <Modal
          title="제출하시겠습니까?"
          primaryLabel="제출"
          secondaryLabel="취소"
          onClose={() => setConfirmOpen(false)}
          onPrimary={submit}
        >
          <p className="cds-body-01 text-text-primary">
            제출하면 <b>수정할 수 없습니다</b>. 대화 로그 1개와 산출물 {artifacts.length}개를 제출합니다.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}

/* ── 공통: 상단 메타 + 카운트다운 ─────────────────────────────────────────── */
function RuntimeHeader({
  runtime,
  onExpire,
  right,
}: {
  runtime: ExamRuntimeData;
  onExpire: () => void;
  right: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-04">
      <div className="flex items-center gap-03">{right}</div>
      <Countdown deadlineAt={runtime.deadlineAt} onExpire={onExpire} />
    </div>
  );
}

/* ── 파일 → sha256(hex) 메타 ──────────────────────────────────────────────── */
async function toFileInput(file: File, kind: 'chat_log' | 'artifact') {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const sha256 = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return {
    kind,
    ref: `upload://${file.name}`,
    sha256,
    sizeBytes: file.size,
    mime: file.type || null,
  };
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
