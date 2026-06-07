'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable, Button, Modal, Field, Input, Select, Notification, type Column } from '@app/ui';
import { useToast } from '@app/core';
import type { BatchListItem } from '@/lib/db/repositories/batches';
import type { Organization } from '@/lib/db/repositories/organizations';
import type { VersionOption } from '@/lib/db/repositories/problems';
import { BatchStatusTag, DeliveryTag } from '../../_components/ui';
import type { ImportSummary } from '@/lib/services/batchService';
import { createBatchAction, setBatchStatusAction, importRosterAction, importRosterXlsxAction } from './actions';

function fmt(d: Date | null): string {
  return d ? new Date(d).toLocaleDateString('ko-KR', { dateStyle: 'medium' }) : '—';
}

function toFormData(file: File): FormData {
  const fd = new FormData();
  fd.set('file', file);
  return fd;
}

type ModalState =
  | null
  | { type: 'create' }
  | { type: 'roster'; batch: BatchListItem }
  | { type: 'status'; batch: BatchListItem };

export function AdminBatchesClient({
  batches,
  orgs,
  versionOptions,
}: {
  batches: BatchListItem[];
  orgs: Organization[];
  versionOptions: VersionOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [modal, setModal] = useState<ModalState>(null);
  const [pending, startTransition] = useTransition();
  // import 결과(전달용 임시비번 포함) — 모달 안에서 1회 노출.
  const [importResult, setImportResult] = useState<(ImportSummary & { parseWarnings?: string[] }) | null>(null);

  function handleCreate(formData: FormData) {
    startTransition(async () => {
      try {
        await createBatchAction(formData);
        setModal(null);
        toast({ kind: 'success', title: '회차가 개설되었습니다.', message: '새 회차가 목록에 추가되었습니다.' });
      } catch (e) {
        toast({ kind: 'error', title: '개설 실패', message: String((e as Error).message) });
      }
    });
  }

  function handleStatusChange(batchId: string, status: 'open' | 'closed') {
    startTransition(async () => {
      try {
        await setBatchStatusAction(batchId, status);
        setModal(null);
        toast({ kind: 'success', title: '회차 상태가 변경되었습니다.', message: `상태를 ${status === 'open' ? '진행' : '종료'}(으)로 바꿨습니다.` });
      } catch {
        toast({ kind: 'error', title: '상태 변경 실패', message: '잠시 후 다시 시도하세요.' });
      }
    });
  }

  function handleImport(batchId: string, source: { csv?: string; file?: File }) {
    startTransition(async () => {
      try {
        const summary = source.file
          ? await importRosterXlsxAction(batchId, toFormData(source.file))
          : await importRosterAction(batchId, source.csv ?? '');
        setImportResult(summary); // 모달 유지 → 전달용 임시비번 노출
        toast({
          kind: 'success',
          title: '로스터 import 완료',
          message: `생성 ${summary.created}명 · 건너뜀 ${summary.skipped}명 · 오류 ${summary.errors}건`,
        });
      } catch (e) {
        toast({ kind: 'error', title: 'Import 실패', message: String((e as Error).message) });
      }
    });
  }

  function closeRoster() {
    setModal(null);
    setImportResult(null);
  }

  const columns: Array<Column<BatchListItem>> = [
    { key: 'name', header: '회차명', sortable: true },
    { key: 'orgName', header: '대학', sortable: true },
    {
      key: 'problemTitle',
      header: '문제',
      render: (r) => `${r.problemTitle} v${r.problemVersion}`,
    },
    {
      key: 'deliveryMode',
      header: '제공',
      render: (r) => <DeliveryTag mode={r.deliveryMode} />,
    },
    {
      key: 'status',
      header: '상태',
      sortable: true,
      render: (r) => <BatchStatusTag status={r.status} />,
    },
    {
      key: 'attemptCount',
      header: '응시',
      render: (r) => `${r.attemptCount} / ${r.capacity}`,
    },
    {
      key: 'submittedCount',
      header: '제출',
      render: (r) => String(r.submittedCount),
    },
    { key: 'scheduledAt', header: '예정일', render: (r) => fmt(r.scheduledAt) },
    {
      key: 'actions',
      header: '',
      className: 'w-44 text-right',
      render: (r) => (
        <span className="flex items-center gap-02 justify-end">
          <Button
            kind="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setModal({ type: 'roster', batch: r });
            }}
          >
            로스터
          </Button>
          {r.status === 'scheduled' && (
            <Button
              kind="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleStatusChange(r.id, 'open');
              }}
            >
              시작
            </Button>
          )}
          {r.status === 'open' && (
            <Button
              kind="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleStatusChange(r.id, 'closed');
              }}
            >
              종료
            </Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <DataTable
        title="회차 목록"
        columns={columns}
        rows={batches}
        getRowId={(r) => r.id}
        onRowClick={(r) => router.push(`/admin/batches/${r.id}`)}
        toolbar={
          <Button kind="primary" size="field" icon="add" onClick={() => setModal({ type: 'create' })}>
            회차 개설
          </Button>
        }
      />

      {modal?.type === 'create' && (
        <CreateBatchModal
          orgs={orgs}
          versionOptions={versionOptions}
          pending={pending}
          onClose={() => setModal(null)}
          onSubmit={handleCreate}
        />
      )}

      {modal?.type === 'roster' && (
        <RosterImportModal
          batch={modal.batch}
          pending={pending}
          result={importResult}
          onClose={closeRoster}
          onSubmit={(source) => handleImport(modal.batch.id, source)}
        />
      )}
    </>
  );
}

/* ── 회차 개설 모달 ─────────────────────────────────────────────────────── */
function CreateBatchModal({
  orgs,
  versionOptions,
  pending,
  onClose,
  onSubmit,
}: {
  orgs: Organization[];
  versionOptions: VersionOption[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (fd: FormData) => void;
}) {
  function handlePrimary() {
    const fd = new FormData(document.getElementById('create-batch-form') as HTMLFormElement);
    onSubmit(fd);
  }

  return (
    <Modal
      title="회차 개설"
      primaryLabel={pending ? '저장 중...' : '개설'}
      onClose={onClose}
      onPrimary={handlePrimary}
    >
      <form id="create-batch-form" className="flex flex-col gap-05">
        <Field label="대학">
          {/* Select only supports string[] options; use native select for value/label pairs */}
          <Select name="orgId">
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="문제 버전">
          <Select name="problemVersionId">
            {versionOptions.map((v) => (
              <option key={v.versionId} value={v.versionId}>
                {v.problemTitle} v{v.version}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="회차명">
          <Input name="name" placeholder="예: 2026 상반기 기획직무 1회차" />
        </Field>
        <Field label="제공방식">
          <Select name="deliveryMode" defaultValue="hosted">
            <option value="hosted">hosted</option>
            <option value="byod">byod</option>
          </Select>
        </Field>
        <Field label="정원">
          <Input name="capacity" type="number" placeholder="50" min="1" max="500" />
        </Field>
      </form>
    </Modal>
  );
}

/* ── 로스터 import 모달 (xlsx/CSV 업로드 → 전달용 임시비번 1회 노출) ──────── */
function RosterImportModal({
  batch,
  pending,
  result,
  onClose,
  onSubmit,
}: {
  batch: BatchListItem;
  pending: boolean;
  result: (ImportSummary & { parseWarnings?: string[] }) | null;
  onClose: () => void;
  onSubmit: (source: { csv?: string; file?: File }) => void;
}) {
  const [csv, setCsv] = useState('');
  const [file, setFile] = useState<File | null>(null);

  // import 완료 → 결과(전달용 자격증명) 화면. 평문 임시비번은 지금만 보인다.
  if (result) {
    const copyAll = () => {
      const text = result.issued.map((c) => `${c.name}\t${c.email}\t${c.tempPassword}`).join('\n');
      void navigator.clipboard?.writeText(text);
    };
    return (
      <Modal
        title={`로스터 import 완료 — ${batch.name}`}
        primaryLabel="닫기"
        secondaryLabel="목록 복사"
        onClose={onClose}
        onPrimary={onClose}
      >
        <Notification kind="success" title={`생성 ${result.created} · 건너뜀 ${result.skipped} · 오류 ${result.errors}`}>
          아래 임시 비밀번호는 <b>지금만</b> 표시됩니다. 학생에게 전달 후 첫 로그인에서 변경하도록 안내하세요.
        </Notification>
        {result.parseWarnings && result.parseWarnings.length > 0 && (
          <Notification kind="warning" title={`파싱 경고 ${result.parseWarnings.length}건`}>
            {result.parseWarnings.slice(0, 5).join(' / ')}
          </Notification>
        )}
        {result.issued.length === 0 ? (
          <p className="cds-body-01 text-text-secondary">신규 발급된 계정이 없습니다(모두 기존 계정에 회차만 추가됨).</p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="cds-label-01 text-text-secondary">신규 계정 {result.issued.length}개</span>
              <Button kind="ghost" size="sm" icon="copy" onClick={copyAll}>전체 복사</Button>
            </div>
            <div className="max-h-[280px] overflow-y-auto border border-border-subtle-01">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-20">
                    <th className="text-left px-04 py-02 cds-label-01 text-text-secondary">이름</th>
                    <th className="text-left px-04 py-02 cds-label-01 text-text-secondary">이메일</th>
                    <th className="text-left px-04 py-02 cds-label-01 text-text-secondary">임시비번</th>
                  </tr>
                </thead>
                <tbody>
                  {result.issued.map((c) => (
                    <tr key={c.email} className="border-t border-border-subtle-01">
                      <td className="px-04 py-02 cds-body-01 text-text-primary">{c.name}</td>
                      <td className="px-04 py-02 cds-body-01 text-text-primary">{c.email}</td>
                      <td className="px-04 py-02 font-mono text-sm text-text-primary">{c.tempPassword}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Modal>
    );
  }

  // 입력 화면: .xlsx 업로드(우선) 또는 CSV 붙여넣기
  return (
    <Modal
      title={`로스터 import — ${batch.name}`}
      primaryLabel={pending ? 'Import 중...' : 'Import'}
      onClose={onClose}
      onPrimary={() => onSubmit(file ? { file } : { csv })}
    >
      <Field label="엑셀 파일 (.xlsx)" helper="1행 헤더: 이름 · 이메일 · 학번(선택). 학교가 보낸 명단을 그대로 업로드하세요.">
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full cds-body-01 text-text-primary file:mr-04 file:border file:border-border-strong-01 file:bg-layer-01 file:px-04 file:py-02 file:cds-label-01 file:text-text-primary hover:file:bg-layer-02"
        />
      </Field>
      <p className="cds-helper-01 text-text-secondary">또는 CSV로 직접 붙여넣기 (파일을 선택하면 CSV는 무시됨):</p>
      <Field label="CSV 데이터">
        <textarea
          className="w-full min-h-[120px] bg-field-01 border border-border-strong-01 text-text-primary cds-body-01 p-04 font-mono text-sm resize-y outline-none focus:shadow-focus-inset disabled:opacity-50"
          placeholder={'홍길동,hong@univ.ac.kr,20240001\n김영희,kim@univ.ac.kr,20240002'}
          value={csv}
          disabled={!!file}
          onChange={(e) => setCsv(e.target.value)}
        />
      </Field>
    </Modal>
  );
}
