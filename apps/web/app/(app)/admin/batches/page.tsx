import { requireGlobalRole } from '@/lib/auth/guard';
import { listForViewer } from '@/lib/services/batchService';
import { organizationsRepo, problemsRepo } from '@/lib/db';
import { PageHead } from '../../_components/ui';
import { AdminBatchesClient } from './AdminBatchesClient';

// admin/batches — 사내 admin 전용. 전체 회차 목록 + 개설/상태변경/로스터 import.

export default async function AdminBatchesPage() {
  const session = await requireGlobalRole('admin');

  const [batches, orgs, versionOptions] = await Promise.all([
    listForViewer(session),
    organizationsRepo.listActive(),
    problemsRepo.listVersionOptions(),
  ]);

  return (
    <>
      <PageHead title="회차 관리" sub="전체 시험 회차를 관리합니다." />
      <AdminBatchesClient
        batches={batches}
        orgs={orgs}
        versionOptions={versionOptions}
      />
    </>
  );
}
