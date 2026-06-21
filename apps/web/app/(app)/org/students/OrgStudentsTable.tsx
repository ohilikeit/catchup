'use client';
import Link from 'next/link';
import { DataTable, Button, Tag, type Column } from '@app/ui';

interface StudentRow {
  userId: string;
  fullName: string;
  email: string | null;
  externalId: string | null;
  isActive: boolean;
  orgId: string;
  orgName: string;
}

export function OrgStudentsTable({ rows }: { rows: StudentRow[] }) {
  const columns: Array<Column<StudentRow>> = [
    {
      key: 'fullName',
      header: '이름',
      sortable: true,
      render: (r) => (
        <Link href={`/org/students/${r.userId}`} className="text-link-primary underline-offset-2 hover:underline">
          {r.fullName}
        </Link>
      ),
    },
    { key: 'email', header: '이메일', sortable: true, render: (r) => r.email ?? '—' },
    { key: 'externalId', header: '학번', className: 'tabular-nums', render: (r) => r.externalId ?? '—' },
    {
      key: 'orgName',
      header: '소속',
      sortable: true,
      render: (r) => <Tag color="gray">{r.orgName}</Tag>,
    },
    {
      key: 'isActive',
      header: '상태',
      sortable: true,
      render: (r) =>
        r.isActive ? (
          <Tag color="green" icon="checkmark-filled">활성</Tag>
        ) : (
          <Tag color="gray">비활성</Tag>
        ),
    },
    {
      key: 'action',
      header: '',
      className: 'w-24 text-right',
      render: (r) => (
        <Button kind="ghost" size="sm" asChild icon="arrow-right">
          <Link href={`/org/students/${r.userId}`}>상세</Link>
        </Button>
      ),
    },
  ];

  return (
    <DataTable
      title="학생 목록"
      columns={columns}
      rows={rows}
      getRowId={(r) => r.userId}
    />
  );
}
