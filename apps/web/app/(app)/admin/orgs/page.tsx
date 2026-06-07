import { requireGlobalRole } from '@/lib/auth/guard';
import { organizationsRepo } from '@/lib/db';
import { PageHead } from '../../_components/ui';
import { AdminOrgsClient } from './AdminOrgsClient';

// admin/orgs — 사내 admin 전용. 대학 목록·추가·비활성화.

export default async function AdminOrgsPage() {
  await requireGlobalRole('admin');
  const orgs = await organizationsRepo.listWithCounts();

  return (
    <>
      <PageHead title="기관 관리" sub="등록된 기관과 담당자 계정을 관리합니다." />
      <AdminOrgsClient orgs={orgs} />
    </>
  );
}
