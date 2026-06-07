import { notFound } from 'next/navigation';
import { Breadcrumb, MetricGrid, MetricTile, Button } from '@app/ui';
import { requireGlobalRole } from '@/lib/auth/guard';
import { getBatchDetailForViewer } from '@/lib/services/batchService';
import { PageHead, BatchStatusTag, DeliveryTag } from '../../../_components/ui';
import { AdminBatchRosterClient } from './AdminBatchRosterClient';
import { setBatchStatusAction } from './actions';

async function BatchStatusForm({
  batchId,
  status,
  label,
  kind,
}: {
  batchId: string;
  status: 'open' | 'closed';
  label: string;
  kind: 'primary' | 'secondary';
}) {
  const action = setBatchStatusAction.bind(null, batchId, status);
  return (
    <form action={action}>
      <Button kind={kind} size="field" type="submit">
        {label}
      </Button>
    </form>
  );
}

export default async function AdminBatchDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await requireGlobalRole('admin');
  const data = await getBatchDetailForViewer(session, params.id);
  if (!data) notFound();

  const { detail, roster, canOperate } = data;

  const crumbs = [
    { label: '회차 운영', href: '/admin/batches' },
    { label: detail.name },
  ];

  const subLine = `${detail.orgName} · ${detail.problemTitle} v${detail.problemVersion} · 정원 ${detail.capacity}명`;

  return (
    <>
      <Breadcrumb items={crumbs} />
      <PageHead
        title={detail.name}
        sub={subLine}
        action={
          <div className="flex items-center gap-03">
            <DeliveryTag mode={detail.deliveryMode} />
            <BatchStatusTag status={detail.status} />
            {canOperate && detail.status === 'scheduled' && (
              <BatchStatusForm batchId={detail.id} status="open" label="시작" kind="primary" />
            )}
            {canOperate && detail.status === 'open' && (
              <BatchStatusForm batchId={detail.id} status="closed" label="종료" kind="secondary" />
            )}
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

      <AdminBatchRosterClient
        batchId={detail.id}
        roster={roster}
        canOperate={canOperate}
      />
    </>
  );
}
