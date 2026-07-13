'use client';
import { useRouter } from 'next/navigation';
import { DataTable, type Column } from '@app/ui';
import type { BatchListItem } from '@/lib/db/repositories/batches';
import { BatchStatusTag } from '../../_components/ui';

function fmt(d: Date | null): string {
  return d ? new Date(d).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium' }) : '—';
}

export function OrgBatchesTable({ rows }: { rows: BatchListItem[] }) {
  const router = useRouter();
  const columns: Array<Column<BatchListItem>> = [
    { key: 'name', header: '회차명', sortable: true },
    {
      key: 'problemTitle',
      header: '문제',
      sortable: true,
      render: (r) => `${r.problemTitle} v${r.problemVersion}${r.problemCount > 1 ? ` 외 ${r.problemCount - 1}개` : ''}`,
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
      className: 'tabular-nums',
      render: (r) => `${r.attemptCount} / ${r.capacity}`,
    },
    {
      key: 'submittedCount',
      header: '제출',
      className: 'tabular-nums',
      render: (r) => String(r.submittedCount),
    },
    {
      key: 'scheduledAt',
      header: '예정일',
      className: 'tabular-nums',
      sortValue: (r) => (r.scheduledAt ? new Date(r.scheduledAt).getTime() : 0),
      render: (r) => fmt(r.scheduledAt),
    },
  ];

  return (
    <DataTable
      title="회차 목록"
      columns={columns}
      rows={rows}
      getRowId={(r) => r.id}
      onRowClick={(r) => router.push(`/org/batches/${r.id}`)}
    />
  );
}
