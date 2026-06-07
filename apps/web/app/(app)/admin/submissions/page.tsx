import { requireGlobalRole } from '@/lib/auth/guard';
import { submissionsRepo } from '@/lib/db';
import { PageHead, EmptyState } from '../../_components/ui';
import { AdminSubmissionsTable } from './AdminSubmissionsTable';

// admin/submissions — 사내 admin 전용. 전체 제출 검증 현황.
// 점수는 평가 모듈 소관. 검증(accepted/rejected) 현황까지만.

export default async function AdminSubmissionsPage() {
  await requireGlobalRole('admin');
  const submissions = await submissionsRepo.listAll();

  return (
    <>
      <PageHead title="제출 현황" sub="전체 응시자의 제출·검증 현황입니다. 평가 결과는 평가 모듈 연결 후 제공됩니다." />
      {submissions.length === 0 ? (
        <EmptyState
          icon="document"
          title="제출 내역이 없습니다"
          message="응시자가 제출하면 여기에 표시됩니다."
        />
      ) : (
        <AdminSubmissionsTable rows={submissions} />
      )}
    </>
  );
}
