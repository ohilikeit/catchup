import { notFound, redirect } from 'next/navigation';
import { Icon } from '@app/ui';
import { requireSession } from '@/lib/auth/guard';
import { getRuntime } from '@/lib/services/examService';
import { ExamTopBar, MobileBlock, Card } from '../../../_components/ExamChrome';
import { StartExamButton } from './StartExamButton';

// (exam) intro — 시작 전 안내·규칙·환경 점검(docs/1 §1·§4). delivery·점수를 모름.
// 서버: 세션 게이트 + 소유권 확인. 이미 제출됐으면 done, 진행 중이면 runtime으로(재접속 복귀).

const RULES = [
  '제한시간은 시작 시점부터 카운트되며, 마감 후 제출은 서버에서 거부됩니다.',
  '한 번 시작하면 제한시간이 고정됩니다(재접속해도 시간이 늘지 않습니다).',
  '제출은 1회입니다. 산출물과 대화 로그를 빠짐없이 첨부하세요.',
  '부정행위가 확인되면 응시가 무효 처리될 수 있습니다.',
];

const CHECKS = [
  '데스크톱 또는 노트북에서 접속했습니다.',
  '안정적인 네트워크 환경입니다.',
  '제출에 필요한 파일(대화 로그·산출물)의 위치를 알고 있습니다.',
];

export default async function ExamIntroPage({ params }: { params: { attemptId: string } }) {
  const session = await requireSession();
  const runtime = await getRuntime(params.attemptId, session.userId);
  if (!runtime) notFound();
  if (runtime.status === 'submitted') redirect(`/exam/${params.attemptId}/done`);
  if (runtime.status === 'expired' || runtime.status === 'void') redirect(`/exam/${params.attemptId}/done`);
  // 재접속 복귀: 이미 진행 중이면 안내를 건너뛰고 바로 진행 화면(배정된 슬롯)으로.
  if (runtime.status === 'running') redirect(`/exam/${params.attemptId}`);

  return (
    <div className="min-h-screen flex flex-col">
      <ExamTopBar title={runtime.problemTitle} sub={runtime.batchName} />

      <MobileBlock />

      <main className="hidden md:block flex-1">
        <div className="mx-auto max-w-[720px] px-06 py-10 flex flex-col gap-07">
          <div>
            <h1 className="cds-heading-05 text-text-primary">시험 안내</h1>
            <p className="cds-body-01 text-text-secondary mt-02">
              {runtime.batchName} · {runtime.problemTitle}
            </p>
          </div>

          <Card>
            <h2 className="cds-heading-compact-02 text-text-primary mb-04">규칙</h2>
            <ul className="flex flex-col gap-03">
              {RULES.map((r) => (
                <li key={r} className="flex items-start gap-03 cds-body-01 text-text-secondary">
                  <span className="text-icon-secondary mt-[2px]">
                    <Icon name="information-filled" size={16} />
                  </span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h2 className="cds-heading-compact-02 text-text-primary mb-04">환경 점검</h2>
            <ul className="flex flex-col gap-03">
              {CHECKS.map((c) => (
                <li key={c} className="flex items-start gap-03 cds-body-01 text-text-secondary">
                  <span className="text-support-success mt-[2px]">
                    <Icon name="checkmark-filled" size={16} />
                  </span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </Card>

          <StartExamButton attemptId={params.attemptId} />
        </div>
      </main>
    </div>
  );
}
