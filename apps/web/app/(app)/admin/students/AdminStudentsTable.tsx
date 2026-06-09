'use client';
import { DataTable, Tag, type Column } from '@app/ui';
import type { UserWithOrgs } from '@/lib/db/repositories/users';

function fmt(d: Date): string {
  return new Date(d).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium' });
}

export function AdminStudentsTable({ rows }: { rows: UserWithOrgs[] }) {
  const columns: Array<Column<UserWithOrgs>> = [
    { key: 'fullName', header: '이름', sortable: true },
    { key: 'email', header: '이메일', sortable: true, render: (r) => r.email ?? '—' },
    {
      key: 'orgs',
      header: '소속',
      render: (r) =>
        r.orgs.length === 0 ? (
          <span className="text-text-secondary cds-helper-01">소속 없음</span>
        ) : (
          <span className="flex flex-wrap gap-02">
            {r.orgs.map((o) => (
              <Tag key={o.orgId} color={o.orgRole === 'org_admin' ? 'blue' : 'gray'}>
                {o.orgName}
              </Tag>
            ))}
          </span>
        ),
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
    { key: 'createdAt', header: '등록일', sortable: true, render: (r) => fmt(r.createdAt) },
  ];

  return (
    <DataTable
      title="사용자 목록"
      columns={columns}
      rows={rows}
      getRowId={(r) => r.id}
    />
  );
}
