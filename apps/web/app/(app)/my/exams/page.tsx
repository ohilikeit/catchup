import type { Metadata } from 'next';
import { requireAudience } from '@/lib/auth/guard';
import { attemptsRepo } from '@/lib/db';
import { PageHead, EmptyState } from '../../_components/ui';
import { MyExamsTable } from './MyExamsTable';

export const metadata: Metadata = { title: '내 시험' };

// my/exams — examinee 홈. 내 응시 목록(예정/진행/완료). 점수·리포트는 모름(평가 모듈 소관, docs/1 §1).
// 서버: 인증 게이트 + 데이터 fetch. 표(상호작용)는 클라 컴포넌트로 분리(함수 prop 경계).

export default async function MyExamsPage() {
  const session = await requireAudience('examinee');
  const exams = await attemptsRepo.listByExaminee(session.userId);

  return (
    <>
      <PageHead title="내 시험" sub="예정·진행·완료된 시험을 확인하고 응시합니다." />
      {exams.length === 0 ? (
        <EmptyState icon="document" title="배정된 시험이 없습니다" message="회차에 배정되면 여기에 표시됩니다. 학교담당자에게 문의하세요." />
      ) : (
        <MyExamsTable rows={exams} />
      )}
    </>
  );
}
