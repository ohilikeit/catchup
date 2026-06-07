'use client';
import { useState, useTransition } from 'react';
import { DataTable, Button, Modal, Field, Input, type Column } from '@app/ui';
import { useToast } from '@app/core';
import type { RosterItem } from '@/lib/db/repositories/attempts';
import { AttemptStatusTag, SubmissionStatusTag } from '../../../_components/ui';
import { extendDeadlineAction, voidAttemptAction } from './actions';

function fmt(d: Date | null): string {
  return d
    ? new Date(d).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
    : '—';
}

type RowAction =
  | { type: 'extend'; item: RosterItem }
  | { type: 'void'; item: RosterItem };

export function AdminBatchRosterClient({
  batchId,
  roster,
  canOperate,
}: {
  batchId: string;
  roster: RosterItem[];
  canOperate: boolean;
}) {
  const { toast } = useToast();
  const [modal, setModal] = useState<RowAction | null>(null);
  const [pending, startTransition] = useTransition();

  function handleExtend(attemptId: string, minutes: number) {
    startTransition(async () => {
      try {
        await extendDeadlineAction(batchId, attemptId, minutes);
        setModal(null);
        toast({ kind: 'success', title: '연장 완료', message: `${minutes}분 연장되었습니다.` });
      } catch (e) {
        toast({ kind: 'error', title: '연장 실패', message: String((e as Error).message) });
      }
    });
  }

  function handleVoid(attemptId: string, reason: string) {
    startTransition(async () => {
      try {
        await voidAttemptAction(batchId, attemptId, reason);
        setModal(null);
        toast({ kind: 'success', title: '무효 처리 완료', message: '응시가 무효 처리되었습니다.' });
      } catch (e) {
        toast({ kind: 'error', title: '무효 처리 실패', message: String((e as Error).message) });
      }
    });
  }

  const columns: Array<Column<RosterItem>> = [
    { key: 'examineeName', header: '응시자', sortable: true },
    {
      key: 'status',
      header: '응시 상태',
      render: (r) => <AttemptStatusTag status={r.status} />,
    },
    {
      key: 'submissionStatus',
      header: '제출 상태',
      render: (r) => <SubmissionStatusTag status={r.submissionStatus} />,
    },
    {
      key: 'submittedAt',
      header: '제출 시각',
      render: (r) => fmt(r.submittedAt),
    },
    ...(canOperate
      ? [
          {
            key: 'actions' as keyof RosterItem,
            header: '',
            className: 'w-40 text-right',
            render: (r: RosterItem) => (
              <span className="flex items-center gap-02 justify-end">
                <Button
                  kind="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setModal({ type: 'extend', item: r });
                  }}
                >
                  연장
                </Button>
                <Button
                  kind="danger"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setModal({ type: 'void', item: r });
                  }}
                >
                  무효
                </Button>
              </span>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <DataTable
        title="응시자 로스터"
        columns={columns}
        rows={roster}
        getRowId={(r) => r.attemptId}
      />

      {modal?.type === 'extend' && (
        <ExtendModal
          item={modal.item}
          pending={pending}
          onClose={() => setModal(null)}
          onSubmit={(minutes) => handleExtend(modal.item.attemptId, minutes)}
        />
      )}

      {modal?.type === 'void' && (
        <VoidModal
          item={modal.item}
          pending={pending}
          onClose={() => setModal(null)}
          onSubmit={(reason) => handleVoid(modal.item.attemptId, reason)}
        />
      )}
    </>
  );
}

/* ── 연장 모달 ─────────────────────────────────────────────────────────────── */
function ExtendModal({
  item,
  pending,
  onClose,
  onSubmit,
}: {
  item: RosterItem;
  pending: boolean;
  onClose: () => void;
  onSubmit: (minutes: number) => void;
}) {
  const [minutes, setMinutes] = useState('30');

  function handlePrimary() {
    const m = Number(minutes);
    if (!Number.isFinite(m) || m <= 0) return;
    onSubmit(m);
  }

  return (
    <Modal
      title={`마감 연장 — ${item.examineeName}`}
      primaryLabel={pending ? '처리 중...' : '연장'}
      onClose={onClose}
      onPrimary={handlePrimary}
    >
      <Field label="연장 시간(분)" helper="1~600분 사이로 입력하세요.">
        <Input
          type="number"
          value={minutes}
          min="1"
          max="600"
          onChange={(e) => setMinutes(e.target.value)}
        />
      </Field>
    </Modal>
  );
}

/* ── 무효 모달 ─────────────────────────────────────────────────────────────── */
function VoidModal({
  item,
  pending,
  onClose,
  onSubmit,
}: {
  item: RosterItem;
  pending: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

  return (
    <Modal
      title={`응시 무효 — ${item.examineeName}`}
      primaryLabel={pending ? '처리 중...' : '무효 처리'}
      onClose={onClose}
      onPrimary={() => onSubmit(reason)}
      danger
    >
      <p className="cds-body-01 text-text-secondary mb-05">
        이 응시를 무효 처리합니다. 제출 완료된 응시는 무효 처리할 수 없습니다.
      </p>
      <Field label="사유(선택)">
        <Input
          placeholder="예: 부정행위 의심"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
    </Modal>
  );
}
