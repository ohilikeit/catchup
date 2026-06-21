import type { Metadata } from 'next';
import { requireGlobalRole } from '@/lib/auth/guard';
import { usersRepo } from '@/lib/db';
import { PageHead, EmptyState } from '../../_components/ui';
import { AdminStudentsTable } from './AdminStudentsTable';

export const metadata: Metadata = { title: '사용자 관리' };

// admin/students — 사내 admin 전용. 전체 사용자 + 소속 org 목록.

export default async function AdminStudentsPage() {
  await requireGlobalRole('admin');
  const users = await usersRepo.listWithOrgs();

  return (
    <>
      <PageHead title="사용자 관리" sub="플랫폼에 등록된 전체 사용자 목록입니다." />
      {users.length === 0 ? (
        <EmptyState
          icon="user"
          title="등록된 사용자가 없습니다"
          message="로스터 import 후 사용자가 등록됩니다."
        />
      ) : (
        <AdminStudentsTable rows={users} />
      )}
    </>
  );
}
