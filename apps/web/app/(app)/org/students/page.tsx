import { requireAudience, myOrgAdminIds } from '@/lib/auth/guard';
import { usersRepo } from '@/lib/db';
import { PageHead, EmptyState } from '../../_components/ui';
import { OrgStudentsTable } from './OrgStudentsTable';

// org/students — org_admin 전용. 자기 대학 학생(examinee) 목록.
// 여러 org를 관리하는 경우 합쳐서 보여주되 org명 표기.

export default async function OrgStudentsPage() {
  const session = await requireAudience('org_admin');
  const orgIds = myOrgAdminIds(session);

  // 각 org별 학생 목록 fetch 후 병합
  const allStudents = (
    await Promise.all(
      orgIds.map(async (orgId) => {
        const org = session.orgs.find((o) => o.orgId === orgId);
        const students = await usersRepo.listExamineesByOrg(orgId);
        return students.map((s) => ({ ...s, orgId, orgName: org?.orgName ?? orgId }));
      }),
    )
  ).flat();

  return (
    <>
      <PageHead title="학생 관리" sub="우리 대학에 배정된 응시자 목록입니다." />
      {allStudents.length === 0 ? (
        <EmptyState
          icon="user"
          title="배정된 학생이 없습니다"
          message="회차 로스터를 import하면 학생이 등록됩니다. 관리자에게 문의하세요."
        />
      ) : (
        <OrgStudentsTable rows={allStudents} />
      )}
    </>
  );
}
