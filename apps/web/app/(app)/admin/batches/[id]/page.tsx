import { notFound } from 'next/navigation';
import { Breadcrumb, MetricGrid, MetricTile } from '@app/ui';
import { requireGlobalRole } from '@/lib/auth/guard';
import { getBatchDetailForViewer } from '@/lib/services/batchService';
import { PageHead, BatchStatusTag } from '../../../_components/ui';
import { AdminBatchRosterClient } from './AdminBatchRosterClient';
import { BatchEnvControls } from './BatchEnvControls';

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

  const scheduledLabel = detail.scheduledAt
    ? new Date(detail.scheduledAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' })
    : '미정';
  const budgetLabel = detail.llmBudgetUsd == null ? '상한 없음' : `$${detail.llmBudgetUsd.toFixed(2)}/인`;
  const subLine = `${detail.orgName} · ${detail.problemTitle} v${detail.problemVersion} · 정원 ${detail.capacity}명 · 예정 ${scheduledLabel} · LLM 예산 ${budgetLabel}`;

  return (
    <>
      <Breadcrumb items={crumbs} />
      <PageHead
        title={detail.name}
        sub={subLine}
        action={
          <div className="flex items-center gap-03">
            <BatchStatusTag status={detail.status} />
            {canOperate && (
              <BatchEnvControls batchId={detail.id} status={detail.status} capacity={detail.capacity} />
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
