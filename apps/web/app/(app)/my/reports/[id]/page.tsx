import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth/guard';
import { getReportForExaminee } from '@/lib/services/attemptService';
import { Breadcrumb } from '@app/ui';
import {
  PageHead,
  Card,
  ComingSoon,
  AttemptStatusTag,
  SubmissionStatusTag,
} from '../../../_components/ui';

// my/reports/[id] — 학생 본인 응시 리포트. 소유권은 service가 강제.
// 평가·상세 리포트는 평가 모듈 소관(docs/1 §6) → ComingSoon.

function fmtDate(d: Date | null): string {
  return d ? new Date(d).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

export default async function MyReportPage({ params }: { params: { id: string } }) {
  const session = await requireSession();

  const detail = await getReportForExaminee(session, params.id);
  if (!detail) notFound();

  return (
    <>
      <Breadcrumb
        className="mb-05"
        items={[
          { label: '내 시험', href: '/my/exams' },
          { label: '리포트' },
        ]}
      />
      <PageHead
        title={detail.problemTitle}
        sub={`${detail.orgName} · ${detail.batchName}`}
      />

      {/* 응시 요약 카드 */}
      <Card className="mb-05">
        <h2 className="cds-heading-compact-02 text-text-primary mb-05">응시 요약</h2>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-07 gap-y-03">
          <dt className="cds-label-01 text-text-secondary">상태</dt>
          <dd><AttemptStatusTag status={detail.status} /></dd>

          <dt className="cds-label-01 text-text-secondary">제출 상태</dt>
          <dd><SubmissionStatusTag status={detail.submissionStatus} /></dd>

          <dt className="cds-label-01 text-text-secondary">제출 시각</dt>
          <dd className="cds-body-01 text-text-primary">{fmtDate(detail.submittedAt)}</dd>
        </dl>
      </Card>

      {/* 평가 결과 — 평가 모듈 연결 전 자리표시 */}
      <ComingSoon
        title="평가 결과"
        message="평가이 끝나면 AI 채팅 평가 50 + 결과 평가 50 리포트가 여기에 표시됩니다."
      />
    </>
  );
}
