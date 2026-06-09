import { notFound, redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth/guard';
import { getRuntimeWithSlot } from '@/lib/services/examService';
import { ExamTopBar, MobileBlock } from '../../_components/ExamChrome';
import { ExamRuntime, type ExamRuntimeData } from './ExamRuntime';

// (exam) 진행 화면 — 전달방식은 hosted 단일(docs/1 §1·§4).
// 서버: 세션 게이트 + 소유권 + 상태 분기. ready=미시작→intro, submitted→done, running만 진행.

export default async function ExamRuntimePage({ params }: { params: { attemptId: string } }) {
  const session = await requireSession();
  const result = await getRuntimeWithSlot(params.attemptId, session.userId);
  if (!result) notFound();
  const { runtime, slot } = result;
  if (runtime.status === 'ready') redirect(`/exam/${params.attemptId}/intro`);
  if (runtime.status === 'submitted') redirect(`/exam/${params.attemptId}/done`);
  if (runtime.status === 'expired' || runtime.status === 'void') {
    redirect(`/exam/${params.attemptId}/done`);
  }

  // Date → ISO 문자열로 직렬화해 클라 컴포넌트에 plain 데이터로 전달.
  const data: ExamRuntimeData = {
    attemptId: runtime.attemptId,
    deadlineAt: runtime.deadlineAt ? runtime.deadlineAt.toISOString() : null,
    problemTitle: runtime.problemTitle,
    batchName: runtime.batchName,
    publicScaffoldRef: runtime.publicScaffoldRef,
    scaffoldSha256: runtime.scaffoldSha256,
    slotEndpoint: slot?.endpoint ?? null,
  };

  return (
    <div className="min-h-screen flex flex-col">
      <ExamTopBar title={runtime.problemTitle} sub={runtime.batchName} />

      <MobileBlock />

      <main className="hidden md:block flex-1">
        <div className="mx-auto max-w-[960px] px-06 py-08">
          <ExamRuntime runtime={data} />
        </div>
      </main>
    </div>
  );
}
