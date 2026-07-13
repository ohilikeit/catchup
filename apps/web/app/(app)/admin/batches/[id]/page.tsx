import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Breadcrumb, MetricGrid, MetricTile, Tag } from '@app/ui';
import { requireGlobalRole } from '@/lib/auth/guard';
import { usersRepo, attemptsRepo } from '@/lib/db';
import { getBatchDetailForViewer } from '@/lib/services/batchService';
import { batchOpsSnapshot } from '@/lib/services/examOpsService';
import { listAllowedModels } from '@/lib/litellm/models';
import { PageHead, BatchStatusTag } from '../../../_components/ui';
import { AdminBatchRosterClient } from './AdminBatchRosterClient';
import { BatchEnvControls } from './BatchEnvControls';
import { BatchOpsPanel } from './BatchOpsPanel';
import { BatchDangerZone } from './BatchDangerZone';

export const metadata: Metadata = { title: '회차 운영' };

export default async function AdminBatchDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await requireGlobalRole('admin');
  const data = await getBatchDetailForViewer(session, params.id);
  if (!data) notFound();

  const { detail, roster, canOperate } = data;
  // 학생 추가 모달의 "기존 사용자에서 선택" 후보(아이디·비번 그대로 — 이 회차 응시만 추가).
  const candidates = canOperate ? await usersRepo.listExamineeCandidates() : [];
  // 응시별 쿼터 사용량(회차당 슬롯 수 ≤ MAX_SLOTS=50이므로 병렬 개별 조회 허용).
  const quotaUsedEntries = await Promise.all(
    roster.map(async (r) => {
      const used = await attemptsRepo.countPromptsSinceReset(r.attemptId).catch(() => 0);
      return [r.attemptId, used] as [string, number];
    }),
  );
  const quotaUsedByAttempt = Object.fromEntries(quotaUsedEntries);
  // 실시간 관제(open 회차만): 슬롯 상태 분포 + LLM spend. 게이트웨이/슬롯 조회는 fail-soft.
  const ops = canOperate && detail.status === 'open' ? await batchOpsSnapshot(detail.id) : null;
  // 환경 열기 재확인용 모델 선택지 — 게이트웨이 불통 시 현재 모델 단일로 폴백(페이지는 렌더).
  const allowedModels = canOperate
    ? await listAllowedModels().then(
        (m) => (m.length > 0 ? m : [detail.model]),
        () => [detail.model],
      )
    : [detail.model];

  const crumbs = [
    { label: '회차 운영', href: '/admin/batches' },
    { label: detail.name },
  ];

  const scheduledLabel = detail.scheduledAt
    ? new Date(detail.scheduledAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' })
    : '미정';
  const budgetLabel = detail.llmBudgetUsd == null ? '상한 없음' : `$${detail.llmBudgetUsd.toFixed(2)}/인`;
  const problemLabel = `${detail.problemTitle} v${detail.problemVersion}${detail.problemCount > 1 ? ` 외 ${detail.problemCount - 1}개` : ''}`;
  const subLine = `${detail.orgName} · ${problemLabel} · 정원 ${detail.capacity}명 · 예정 ${scheduledLabel} · LLM 예산 ${budgetLabel} · 프롬프트 ${detail.promptQuota}회`;

  return (
    <>
      <Breadcrumb items={crumbs} />
      <PageHead
        title={detail.name}
        sub={subLine}
        action={
          <div className="flex items-center gap-03">
            <Tag color="blue">{detail.model}</Tag>
            <Tag>프롬프트 {detail.promptQuota}회</Tag>
            <BatchStatusTag status={detail.status} />
            {canOperate && (
              <BatchEnvControls
                batchId={detail.id}
                status={detail.status}
                capacity={detail.capacity}
                model={detail.model}
                allowedModels={allowedModels}
              />
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

      {ops && <BatchOpsPanel ops={ops} />}

      <AdminBatchRosterClient
        batchId={detail.id}
        roster={roster}
        candidates={candidates}
        canOperate={canOperate}
        promptQuota={detail.promptQuota}
        quotaUsedByAttempt={quotaUsedByAttempt}
      />

      {canOperate && (
        <BatchDangerZone
          batchId={detail.id}
          status={detail.status}
          name={detail.name}
          attemptCount={detail.attemptCount}
        />
      )}
    </>
  );
}
