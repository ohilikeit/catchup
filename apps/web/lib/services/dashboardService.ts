import 'server-only';
import * as batchesRepo from '../db/repositories/batches';
import * as submissionsRepo from '../db/repositories/submissions';
import * as orgsRepo from '../db/repositories/organizations';
import { listForViewer } from './batchService';
import { myOrgAdminIds } from '../auth/guard';
import type { Session } from '../auth/session';

// dashboardService — 대시보드 집계. 회차 목록(이미 집계 조인됨)을 재사용해 추가 쿼리를 줄인다.
// org_admin은 자기 대학만(스코프 강제), admin은 전체.

export interface DashboardMetrics {
  batchCount: number;
  attemptCount: number;
  submittedCount: number;
  acceptedCount: number;
  openBatches: number;
}

function rollup(batches: batchesRepo.BatchListItem[]): DashboardMetrics {
  return batches.reduce<DashboardMetrics>(
    (acc, b) => ({
      batchCount: acc.batchCount + 1,
      attemptCount: acc.attemptCount + b.attemptCount,
      submittedCount: acc.submittedCount + b.submittedCount,
      acceptedCount: acc.acceptedCount + b.acceptedCount,
      openBatches: acc.openBatches + (b.status === 'open' ? 1 : 0),
    }),
    { batchCount: 0, attemptCount: 0, submittedCount: 0, acceptedCount: 0, openBatches: 0 },
  );
}

/** viewer 스코프의 대시보드 지표 + 최근 회차 + 최근 제출. */
export async function getDashboard(session: Session): Promise<{
  metrics: DashboardMetrics;
  recentBatches: batchesRepo.BatchListItem[];
  recentSubmissions: submissionsRepo.SubmissionListItem[];
}> {
  const batches = await listForViewer(session);
  const isAdmin = session.globalRoles.includes('admin');
  const recentSubmissions = isAdmin
    ? await submissionsRepo.listAll({ limit: 8 })
    : await submissionsRepo.listByOrgIds(myOrgAdminIds(session), { limit: 8 });
  return {
    metrics: rollup(batches),
    recentBatches: batches.slice(0, 6),
    recentSubmissions,
  };
}

/** admin 홈 보조: 활성 대학 수(전체 스코프 전용). */
export async function activeOrgCount(): Promise<number> {
  const orgs = await orgsRepo.listActive();
  return orgs.length;
}
