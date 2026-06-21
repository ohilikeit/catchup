import type { Metadata } from 'next';
import { requireGlobalRole } from '@/lib/auth/guard';
import { problemsRepo } from '@/lib/db';
import { PageHead, EmptyState } from '../../_components/ui';
import { AdminProblemsTable } from './AdminProblemsTable';
import { AdminProblemUpload } from './AdminProblemUpload';

export const metadata: Metadata = { title: '문제 관리' };

// admin/problems — 사내 admin 전용. 문제 목록(읽기) + 버전 업로드(MinIO 적재).

export default async function AdminProblemsPage() {
  await requireGlobalRole('admin');
  const problems = await problemsRepo.listProblemsWithVersions();

  return (
    <>
      <PageHead title="문제 관리" sub="등록된 과제 문제 목록입니다." action={<AdminProblemUpload />} />

      {problems.length === 0 ? (
        <EmptyState
          icon="document"
          title="등록된 문제가 없습니다"
          message="문제와 버전이 등록되면 여기에 표시됩니다."
        />
      ) : (
        <AdminProblemsTable rows={problems} />
      )}
    </>
  );
}
