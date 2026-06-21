import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth/guard';
import { getRuntimeWithSlot, noteReconnect } from '@/lib/services/examService';
import { MobileBlock } from '../../_components/ExamChrome';
import { ExamRuntime, type ExamRuntimeData } from './ExamRuntime';

export const metadata: Metadata = { title: '시험 진행' };

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

  // 재접속 관측(docs/5 §5): 진행 화면 재진입을 타임라인에 디바운스 기록(슬롯 배정된 경우만 = 실제 재연결).
  if (slot && slot.state === 'assigned') {
    await noteReconnect(runtime.attemptId);
  }

  // Date → ISO 문자열로 직렬화해 클라 컴포넌트에 plain 데이터로 전달.
  const data: ExamRuntimeData = {
    attemptId: runtime.attemptId,
    deadlineAt: runtime.deadlineAt ? runtime.deadlineAt.toISOString() : null,
    problemTitle: runtime.problemTitle,
    batchName: runtime.batchName,
    publicScaffoldRef: runtime.publicScaffoldRef,
    scaffoldSha256: runtime.scaffoldSha256,
    slotNo: slot?.slotNo ?? null,
  };

  // ⭐ 풀스크린: 시작 직후부터 IDE가 화면을 꽉 채운다(타이머·제출은 런타임 상단 바에 내장).
  return (
    <>
      <MobileBlock />
      <main className="hidden md:block">
        <ExamRuntime runtime={data} />
      </main>
    </>
  );
}
