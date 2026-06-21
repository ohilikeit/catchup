import type { Metadata } from 'next';
import { requireAudience } from '@/lib/auth/guard';
import { listForViewer } from '@/lib/services/batchService';
import { Notification } from '@app/ui';
import { PageHead, EmptyState } from '../../_components/ui';
import { OrgBatchesTable } from './OrgBatchesTable';

export const metadata: Metadata = { title: '회차 현황' };

// org/batches — org_admin 전용. 자기 대학 회차 목록(읽기 전용).
// 회차 개설은 admin 소관. 현황 파악용.

export default async function OrgBatchesPage() {
  const session = await requireAudience('org_admin');
  const batches = await listForViewer(session);

  return (
    <>
      <PageHead title="회차 현황" sub="우리 대학에 개설된 시험 회차 목록입니다." />

      <Notification kind="info" title="회차 개설은 관리자에게 문의하세요." className="mb-06 max-w-[680px]">
        회차 개설·수정은 사내 관리자가 진행합니다. 회차 현황만 확인하실 수 있습니다.
      </Notification>

      {batches.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="개설된 회차가 없습니다"
          message="관리자가 회차를 개설하면 여기에 표시됩니다."
        />
      ) : (
        <OrgBatchesTable rows={batches} />
      )}
    </>
  );
}
