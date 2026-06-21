'use client';
import { DataTable, type Column } from '@app/ui';
import type { RosterItem } from '@/lib/db/repositories/attempts';
import { AttemptStatusTag, SubmissionStatusTag } from '../../../_components/ui';

function fmt(d: Date | null): string {
  return d
    ? new Date(d).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short' })
    : '—';
}

export function OrgBatchRosterClient({ roster }: { roster: RosterItem[] }) {
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
      className: 'tabular-nums',
      render: (r) => fmt(r.submittedAt),
    },
  ];

  return (
    <DataTable
      title="응시자 로스터"
      columns={columns}
      rows={roster}
      getRowId={(r) => r.attemptId}
    />
  );
}
