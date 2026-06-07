import { requireGlobalRole } from '@/lib/auth/guard';
import { problemsRepo } from '@/lib/db';
import { Notification } from '@app/ui';
import { PageHead, EmptyState } from '../../_components/ui';
import { AdminProblemsTable } from './AdminProblemsTable';

// admin/problems — 사내 admin 전용. 문제 목록(읽기). 버전 업로드는 별도 모듈 소관.

export default async function AdminProblemsPage() {
  await requireGlobalRole('admin');
  const problems = await problemsRepo.listProblemsWithVersions();

  return (
    <>
      <PageHead title="문제 관리" sub="등록된 과제 문제 목록입니다." />

      <Notification kind="info" title="버전 업로드는 추후 지원 예정입니다." className="mb-06 max-w-[680px]">
        문제 버전 업로드 및 편집 기능은 별도 모듈 연결 후 제공됩니다. 현재는 목록 조회만 가능합니다.
      </Notification>

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
