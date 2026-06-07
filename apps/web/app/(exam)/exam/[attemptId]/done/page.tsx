import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@app/ui';
import { requireSession } from '@/lib/auth/guard';
import { getRuntime } from '@/lib/services/examService';
import { ExamTopBar, ComingSoon, Card } from '../../../_components/ExamChrome';

// (exam) done — 제출 완료 안내(docs/1 §1·§4). 점수·리포트는 평가 모듈 소관 → placeholder.
// done은 모바일 차단 대상 아님(읽기 전용 안내) — 좁은 화면에서도 그대로 노출.

export default async function ExamDonePage({ params }: { params: { attemptId: string } }) {
  const session = await requireSession();
  const runtime = await getRuntime(params.attemptId, session.userId);
  if (!runtime) notFound();

  return (
    <div className="min-h-screen flex flex-col">
      <ExamTopBar title={runtime.problemTitle} sub={runtime.batchName} />

      <main className="flex-1">
        <div className="mx-auto max-w-[640px] px-06 py-10 flex flex-col gap-07">
          <Card className="flex flex-col items-center text-center py-10">
            <span className="text-support-success">
              <Icon name="checkmark-filled" size={48} />
            </span>
            <h1 className="cds-heading-05 text-text-primary mt-04">제출이 완료되었습니다</h1>
            <p className="cds-body-01 text-text-secondary mt-02 max-w-[44ch]">
              {runtime.problemTitle} 응시가 정상적으로 접수되었습니다. 추가 제출은 필요하지 않습니다.
            </p>
          </Card>

          <ComingSoon
            icon="time"
            title="결과 리포트는 평가 후 제공됩니다"
            message="제출물에 대한 평가이 끝나면 결과와 리포트를 확인할 수 있습니다. 준비되면 안내드립니다."
          />

          <div className="flex justify-center">
            <Link
              href="/my/exams"
              className="cds-body-compact-01 text-link-primary hover:text-link-primary-hover inline-flex items-center gap-02"
            >
              내 시험 목록으로 돌아가기
              <Icon name="arrow-right" size={16} />
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
