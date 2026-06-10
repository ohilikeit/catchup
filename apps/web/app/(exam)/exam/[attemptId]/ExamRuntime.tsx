'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Tag, Icon } from '@app/ui';
import { useToast } from '@app/core';
import { Countdown } from '../../_components/Countdown';
import { ComingSoon } from '../../_components/ExamChrome';
import { WaitingForSlot } from './WaitingForSlot';

// (exam) 진행 화면 런타임 — 전달방식은 hosted 단일(docs/1 §4·§5).
// 부모(page.tsx 서버)가 status='running'만 통과시킨다.
// ⭐ 풀스크린 레이아웃: 상단 얇은 바(문제·타이머·제출)만 남기고 나머지는 전부 IDE(iframe).
//   시작 직후부터 작업 영역이 화면을 꽉 채운다 — 별도 새 창 없이도 전체화면에 준하는 경험.
// runtime은 서버에서 plain 직렬화해 전달(Date → ISO 문자열).

export interface ExamRuntimeData {
  attemptId: string;
  deadlineAt: string | null;
  problemTitle: string;
  batchName: string;
  publicScaffoldRef: string;
  scaffoldSha256: string;
  /** 배정된 슬롯 번호. null이면 슬롯 미배정(환경 준비 중 표시). IDE 경로(/exam-ide/{N})의 근거. */
  slotNo: number | null;
}

/* ── hosted: 웹 IDE — code-server 풀스크린 iframe (인증 ingress 경유) ── */
export function ExamRuntime({ runtime }: { runtime: ExamRuntimeData }) {
  // IDE 경로 — 같은 도메인 /exam-ide/{슬롯번호} 를 traefik 이 ForwardAuth(세션+그 슬롯 소유권) 통과 시
  // "그 슬롯의 pod"에만 직결(슬롯별 Service). 같은 오리진이라 세션 쿠키 전달 + WS·에셋 완전 동작.
  // 슬롯 번호는 표시용일 뿐 권한이 아니다 — 서버(exam-authz)가 배정 슬롯과 대조해 재판단한다(대원칙 ⑤).
  const IDE_URL = `/exam-ide/${runtime.slotNo}/?folder=/home/coder/project`;
  const router = useRouter();
  const { toast } = useToast();
  const [expired, setExpired] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    // 제출은 되돌릴 수 없으므로 확인. (네이티브 다이얼로그 — 앱 UI 토큰과 무관)
    if (!window.confirm('지금 제출하시겠습니까? 제출 후에는 수정할 수 없습니다.')) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/exam/${runtime.attemptId}/submit`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok || !body?.success) {
        toast({ kind: 'error', title: '제출 실패', message: body?.error?.message ?? '제출에 실패했습니다.' });
        setSubmitting(false);
        return;
      }
      router.push(`/exam/${runtime.attemptId}/done`);
    } catch {
      toast({ kind: 'error', title: '제출 실패', message: '네트워크 오류로 제출에 실패했습니다. 다시 시도하세요.' });
      setSubmitting(false);
    }
  }

  const ideReady = !expired && runtime.slotNo !== null;

  return (
    <div className="flex flex-col h-screen">
      {/* 상단 바: 문제·회차(좌) / 타이머·새 창·제출(우) — 이 48px 외에는 전부 작업 영역 */}
      <header className="shrink-0 h-12 border-b border-border-subtle-01 bg-layer-01 px-05 flex items-center justify-between gap-05">
        <div className="flex items-center gap-03 min-w-0">
          <span className="text-icon-secondary shrink-0">
            <Icon name="document" size={20} />
          </span>
          <span className="cds-heading-compact-01 text-text-primary truncate">{runtime.problemTitle}</span>
          <span className="cds-helper-01 text-text-secondary truncate hidden lg:inline">{runtime.batchName}</span>
          <span className="shrink-0">
            <Tag color="purple">호스팅</Tag>
          </span>
        </div>
        <div className="flex items-center gap-04 shrink-0">
          <Countdown deadlineAt={runtime.deadlineAt} onExpire={() => setExpired(true)} />
          {ideReady && (
            <Button kind="ghost" size="sm" icon="launch" onClick={() => window.open(IDE_URL, '_blank', 'noopener')}>
              새 창
            </Button>
          )}
          <Button kind="primary" size="sm" icon="checkmark" disabled={submitting || expired} onClick={submit}>
            {submitting ? '제출 중…' : '제출'}
          </Button>
        </div>
      </header>

      {expired ? (
        /* 마감 후: iframe 차단(서버 인가도 차단). docs/4 "마감→iframe 차단". */
        <div className="flex-1 flex items-center justify-center px-06">
          <ComingSoon
            icon="warning-filled"
            title="제한시간이 종료되어 IDE가 차단되었습니다"
            message="더 이상 작업할 수 없습니다. 최종 제출물은 서버 기준으로 처리됩니다."
          />
        </div>
      ) : runtime.slotNo !== null ? (
        /* 슬롯 배정됨: code-server 가 상단 바를 제외한 화면 전체를 차지. */
        <iframe
          src={IDE_URL}
          className="flex-1 w-full border-0 block"
          title="웹 IDE"
          allow="clipboard-read; clipboard-write"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals"
        />
      ) : (
        /* 슬롯 미배정(워밍 풀 대기): 2초 폴링으로 단계 표시, 배정되면 자동 진입. */
        <WaitingForSlot attemptId={runtime.attemptId} />
      )}
    </div>
  );
}
