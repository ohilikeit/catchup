import { notFound } from 'next/navigation';
import { requireAudience } from '@/lib/auth/guard';
import * as attemptService from '@/lib/services/attemptService';
import { Breadcrumb } from '@app/ui';
import {
  PageHead,
  Card,
  EmptyState,
  ComingSoon,
  AttemptStatusTag,
  SubmissionStatusTag,
} from '../../../_components/ui';

// org/students/[id] — 학생 상세(실데이터). org_admin이 자기 org 소속 학생만 조회 가능.
// 점수·리포트는 평가 모듈 소관 → ComingSoon.

function fmt(d: Date | null): string {
  return d ? new Date(d).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

export default async function OrgStudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: userId } = await params;
  const session = await requireAudience('org_admin');

  const result = await attemptService.getStudentForOrg(session, userId);
  if (!result) notFound();

  const { user, attempts } = result;

  return (
    <>
      <Breadcrumb
        items={[
          { label: '학생 목록', href: '/org/students' },
          { label: user.fullName },
        ]}
      />

      <PageHead
        title={user.fullName}
        sub={[user.email, user.externalId ? `학번 ${user.externalId}` : null]
          .filter((v): v is string => v !== null)
          .join(' · ') || undefined}
      />

      {/* 기본 정보 */}
      <Card className="mb-05 max-w-[640px]">
        <h2 className="cds-heading-compact-02 text-text-primary mb-05">기본 정보</h2>
        <dl className="grid grid-cols-[160px_1fr] gap-y-04 cds-body-01">
          <dt className="text-text-secondary">이름</dt>
          <dd className="text-text-primary">{user.fullName}</dd>
          <dt className="text-text-secondary">이메일</dt>
          <dd className="text-text-primary">{user.email ?? '—'}</dd>
          <dt className="text-text-secondary">학번</dt>
          <dd className="text-text-primary">{user.externalId ?? '—'}</dd>
          <dt className="text-text-secondary">상태</dt>
          <dd className="text-text-primary">{user.isActive ? '활성' : '비활성'}</dd>
        </dl>
      </Card>

      {/* 응시 이력 */}
      <section className="mb-07">
        <h2 className="cds-heading-compact-02 text-text-primary mb-04">응시 이력</h2>
        {attempts.length === 0 ? (
          <EmptyState
            icon="folder"
            title="응시 이력 없음"
            message="이 학생에게 배정된 응시 기록이 없습니다."
          />
        ) : (
          <div className="border border-border-subtle-01 bg-layer-02 overflow-x-auto">
            <table className="w-full cds-body-01">
              <thead>
                <tr className="border-b border-border-subtle-01 bg-layer-03">
                  <th className="text-left text-text-secondary px-04 py-03 font-normal whitespace-nowrap">과제</th>
                  <th className="text-left text-text-secondary px-04 py-03 font-normal whitespace-nowrap">회차</th>
                  <th className="text-left text-text-secondary px-04 py-03 font-normal whitespace-nowrap">상태</th>
                  <th className="text-left text-text-secondary px-04 py-03 font-normal whitespace-nowrap">제출</th>
                  <th className="text-left text-text-secondary px-04 py-03 font-normal whitespace-nowrap">마감</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.attemptId} className="border-b border-border-subtle-01 last:border-b-0">
                    <td className="px-04 py-03 text-text-primary">{a.problemTitle}</td>
                    <td className="px-04 py-03 text-text-secondary">{a.batchName}</td>
                    <td className="px-04 py-03">
                      <AttemptStatusTag status={a.status} />
                    </td>
                    <td className="px-04 py-03">
                      <SubmissionStatusTag status={a.submissionStatus} />
                    </td>
                    <td className="px-04 py-03 text-text-secondary whitespace-nowrap">{fmt(a.deadlineAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 점수·리포트는 평가 모듈 소관 */}
      <ComingSoon
        title="점수 및 평가 리포트"
        message="이 학생의 평가 결과와 리포트는 평가 모듈 연결 후 제공됩니다."
      />
    </>
  );
}
