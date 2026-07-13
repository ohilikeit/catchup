import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Breadcrumb, MetricGrid, MetricTile } from '@app/ui';
import { requireAudience } from '@/lib/auth/guard';
import { getBatchDetailForViewer } from '@/lib/services/batchService';
import { PageHead, BatchStatusTag } from '../../../_components/ui';
import { OrgBatchRosterClient } from './OrgBatchRosterClient';

export const metadata: Metadata = { title: '회차 상세' };

export default async function OrgBatchDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await requireAudience('org_admin');
  const data = await getBatchDetailForViewer(session, params.id);
  if (!data) notFound();

  const { detail, roster } = data;

  const crumbs = [
    { label: '회차', href: '/org/batches' },
    { label: detail.name },
  ];

  const subLine = `${detail.orgName} · ${detail.problemTitle} v${detail.problemVersion}${detail.problemCount > 1 ? ` 외 ${detail.problemCount - 1}개` : ''} · 정원 ${detail.capacity}명`;

  return (
    <>
      <Breadcrumb items={crumbs} />
      <PageHead
        title={detail.name}
        sub={subLine}
        action={
          <div className="flex items-center gap-03">
            <BatchStatusTag status={detail.status} />
          </div>
        }
      />

      <MetricGrid className="mb-07">
        <MetricTile
          label="응시"
          value={detail.attemptCount}
          icon="user"
          delta={`정원 ${detail.capacity}명`}
        />
        <MetricTile
          label="제출"
          value={detail.submittedCount}
          icon="document"
          delta={
            detail.attemptCount > 0
              ? `${Math.round((detail.submittedCount / detail.attemptCount) * 100)}%`
              : undefined
          }
        />
        <MetricTile
          label="승인"
          value={detail.acceptedCount}
          icon="checkmark"
          trend={detail.acceptedCount > 0 ? 'up' : undefined}
        />
      </MetricGrid>

      <OrgBatchRosterClient roster={roster} />
    </>
  );
}
