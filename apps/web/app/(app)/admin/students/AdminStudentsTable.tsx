'use client';
import { useTransition } from 'react';
import { DataTable, Tag, Button, type Column } from '@app/ui';
import { useToast } from '@app/core';
import type { UserWithOrgs } from '@/lib/db/repositories/users';
import { setStudentActiveAction, deleteStudentAction } from './actions';

function fmt(d: Date): string {
  return new Date(d).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium' });
}

export function AdminStudentsTable({ rows }: { rows: UserWithOrgs[] }) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  function toggleActive(r: UserWithOrgs) {
    startTransition(async () => {
      const res = await setStudentActiveAction(r.id, !r.isActive);
      toast(
        res.ok
          ? { kind: 'success', title: '변경됨', message: res.message }
          : { kind: 'error', title: '변경 실패', message: res.message },
      );
    });
  }

  function remove(r: UserWithOrgs) {
    // 파괴 액션 — 확인 후. 서버가 응시 0을 최종 판정(클라 가드는 편의).
    if (!window.confirm(`사용자 "${r.fullName}"을(를) 삭제합니다. 되돌릴 수 없습니다. 계속할까요?`)) return;
    startTransition(async () => {
      const res = await deleteStudentAction(r.id);
      toast(
        res.ok
          ? { kind: 'success', title: '사용자 삭제됨', message: res.message }
          : { kind: 'error', title: '삭제할 수 없음', message: res.message },
      );
    });
  }

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
    {
      key: 'actions',
      header: '',
      className: 'w-48 text-right',
      render: (r) => (
        <span className="flex items-center gap-02 justify-end">
          <Button kind="ghost" size="sm" disabled={pending} onClick={() => toggleActive(r)}>
            {r.isActive ? '비활성화' : '활성화'}
          </Button>
          {r.attemptCount === 0 && (
            <Button kind="ghost" size="sm" icon="trash" disabled={pending} onClick={() => remove(r)}>
              삭제
            </Button>
          )}
        </span>
      ),
    },
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
