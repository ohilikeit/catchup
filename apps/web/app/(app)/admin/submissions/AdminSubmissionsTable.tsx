'use client';
import Link from 'next/link';
import { DataTable, Tag, type Column } from '@app/ui';
import type { SubmissionListItem } from '@/lib/db/repositories/submissions';
import { SubmissionStatusTag, TrustTag } from '../../_components/ui';

function fmt(d: Date | null): string {
  return d ? new Date(d).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

const CAPTURED_VIA_LABEL: Record<string, string> = {
  proxy: '프록시',
};

export function AdminSubmissionsTable({ rows }: { rows: SubmissionListItem[] }) {
  const columns: Array<Column<SubmissionListItem>> = [
    {
      key: 'examineeName',
      header: '응시자',
      sortable: true,
      render: (r) => (
        <Link href={`/admin/submissions/${r.id}`} className="text-link-primary hover:underline">
          {r.examineeName}
        </Link>
      ),
    },
    { key: 'orgName', header: '대학', sortable: true },
    { key: 'batchName', header: '회차', sortable: true },
    {
      key: 'capturedVia',
      header: '수집 경로',
      render: (r) => (
        <Tag color="purple">
          {CAPTURED_VIA_LABEL[r.capturedVia] ?? r.capturedVia}
        </Tag>
      ),
    },
    {
      key: 'trust',
      header: '신뢰',
      render: (r) => <TrustTag trust={r.trust} />,
    },
    {
      key: 'status',
      header: '상태',
      sortable: true,
      render: (r) => <SubmissionStatusTag status={r.status} />,
    },
    {
      key: 'fileCount',
      header: '파일',
      className: 'tabular-nums',
      render: (r) => String(r.fileCount),
    },
    {
      key: 'submittedAt',
      header: '제출일시',
      className: 'tabular-nums',
      sortValue: (r) => (r.submittedAt ? new Date(r.submittedAt).getTime() : 0),
      render: (r) => fmt(r.submittedAt),
    },
  ];

  return (
    <DataTable
      title="제출 목록"
      columns={columns}
      rows={rows}
      getRowId={(r) => r.id}
    />
  );
}
