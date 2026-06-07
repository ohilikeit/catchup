'use client';
import { useRouter } from 'next/navigation';
import { DataTable, type Column } from '@app/ui';
import type { BatchListItem } from '@/lib/db/repositories/batches';
import { BatchStatusTag, DeliveryTag } from '../../_components/ui';

function fmt(d: Date | null): string {
  return d ? new Date(d).toLocaleDateString('ko-KR', { dateStyle: 'medium' }) : '—';
}

export function OrgBatchesTable({ rows }: { rows: BatchListItem[] }) {
  const router = useRouter();
  const columns: Array<Column<BatchListItem>> = [
    { key: 'name', header: '회차명', sortable: true },
    {
      key: 'problemTitle',
      header: '문제',
      sortable: true,
      render: (r) => `${r.problemTitle} v${r.problemVersion}`,
    },
    {
      key: 'deliveryMode',
      header: '제공방식',
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
    {
      key: 'scheduledAt',
      header: '예정일',
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
