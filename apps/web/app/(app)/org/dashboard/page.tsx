import { requireAudience } from '@/lib/auth/guard';
import { getDashboard } from '@/lib/services/dashboardService';
import { MetricGrid, MetricTile, Notification } from '@app/ui';
import { PageHead, EmptyState, AttemptStatusTag, SubmissionStatusTag, TrustTag } from '../../_components/ui';

// org/dashboard — 학교담당자 홈. ⭐ 자기 대학 응시·제출 현황만(org 스코프, dashboardService가 강제).
// 점수 집계는 평가 모듈 이후(docs/1 §1). 여기선 진행·제출 현황까지.

export default async function OrgDashboardPage() {
  const session = await requireAudience('org_admin');
  const { metrics, recentBatches, recentSubmissions } = await getDashboard(session);
  const orgNames = session.orgs.filter((o) => o.orgRole === 'org_admin').map((o) => o.orgName).join(', ');

  return (
    <>
      <PageHead title="대시보드" sub={`${orgNames || '우리 대학'}의 응시·제출 현황`} />

      <MetricGrid className="mb-07">
        <MetricTile label="회차" value={metrics.batchCount} icon="calendar" delta={`진행중 ${metrics.openBatches}`} />
        <MetricTile label="응시" value={metrics.attemptCount} icon="user" />
        <MetricTile label="제출완료" value={metrics.submittedCount} icon="checkmark" trend={metrics.submittedCount > 0 ? 'up' : undefined} delta={metrics.attemptCount > 0 ? `${Math.round((metrics.submittedCount / metrics.attemptCount) * 100)}%` : undefined} />
        <MetricTile label="승인 제출" value={metrics.acceptedCount} icon="document" />
      </MetricGrid>

      {metrics.batchCount === 0 ? (
        <EmptyState icon="calendar" title="아직 회차가 없습니다" message="관리자가 회차를 개설하면 현황이 여기에 표시됩니다." />
      ) : (
        <div className="grid lg:grid-cols-2 gap-05">
          {/* 최근 회차 */}
          <section className="bg-layer-02 border border-border-subtle-01">
            <h3 className="cds-heading-compact-02 text-text-primary px-05 h-12 flex items-center border-b border-border-subtle-01">최근 회차</h3>
            <ul>
              {recentBatches.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-04 px-05 py-04 border-b border-border-subtle-01 last:border-0">
                  <div className="min-w-0">
                    <div className="cds-body-01 text-text-primary truncate">{b.name}</div>
                    <div className="cds-helper-01 text-text-secondary mt-[2px]">{b.problemTitle} · 응시 {b.attemptCount}/{b.capacity}</div>
                  </div>
                  <div className="flex items-center gap-02 flex-[0_0_auto]"><AttemptStatusTag status={b.status === 'open' ? 'running' : 'ready'} /></div>
                </li>
              ))}
            </ul>
          </section>

          {/* 최근 제출 */}
          <section className="bg-layer-02 border border-border-subtle-01">
            <h3 className="cds-heading-compact-02 text-text-primary px-05 h-12 flex items-center border-b border-border-subtle-01">최근 제출</h3>
            {recentSubmissions.length === 0 ? (
              <p className="cds-body-01 text-text-secondary px-05 py-06">아직 제출이 없습니다.</p>
            ) : (
              <ul>
                {recentSubmissions.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-04 px-05 py-04 border-b border-border-subtle-01 last:border-0">
                    <div className="min-w-0">
                      <div className="cds-body-01 text-text-primary truncate">{s.examineeName}</div>
                      <div className="cds-helper-01 text-text-secondary mt-[2px]">{s.batchName} · 파일 {s.fileCount}</div>
                    </div>
                    <div className="flex items-center gap-02 flex-[0_0_auto]"><TrustTag trust={s.trust} /><SubmissionStatusTag status={s.status} /></div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <Notification kind="info" title="점수·리포트는 평가 모듈 이후 제공됩니다." className="mt-07 max-w-[680px]">
        현재 뼈대는 응시·제출 현황까지 보여줍니다. 평가 결과와 리포트는 별도 모듈이 연결되면 표시됩니다.
      </Notification>
    </>
  );
}
