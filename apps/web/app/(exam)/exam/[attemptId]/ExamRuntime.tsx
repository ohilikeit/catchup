'use client';
import { useState, useEffect, useRef } from 'react';
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
  // IDE URL — 슬롯별 서브도메인(slotN.<현재도메인>)에 code-server 직결. ⭐ subdomain 라우팅이라 code-server 가
  // 루트로 서빙되어 webview service worker 가 정상 등록된다(구 /exam-ide/{N} subpath 의 webview CSP 에러 해소).
  // 슬롯 번호는 표시용일 뿐 권한이 아니다 — 서버(exam-authz)가 배정 슬롯과 대조해 재판단한다(대원칙 ⑤).
  const router = useRouter();
  const { toast } = useToast();
  const [expired, setExpired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // 서브도메인 URL 은 window 기반이라 클라에서 계산(SSR 하이드레이션 불일치 회피) — 준비 전엔 src 미설정.
  const [ideUrl, setIdeUrl] = useState<string | null>(null);
  useEffect(() => {
    if (runtime.slotNo === null) return;
    const { protocol, hostname, port } = window.location;
    const host = `slot${runtime.slotNo}.${hostname}${port ? `:${port}` : ''}`;
    setIdeUrl(`${protocol}//${host}/?folder=/home/coder/project`);
  }, [runtime.slotNo]);

  // 프롬프트 잔량 폴링(8초 간격). iframe 안 Claude 사용을 직접 감지 못하므로 주기 폴링.
  // 실패는 조용히 무시(이전 값 유지) — 학생 경험을 해치지 않는다.
  const [quota, setQuota] = useState<{ remaining: number; limit: number; blocked: boolean } | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function fetchQuota() {
      try {
        const res = await fetch(`/api/exam/${runtime.attemptId}/quota`);
        if (!res.ok) return;
        const body = await res.json();
        if (body?.success && body.data) {
          setQuota({ remaining: body.data.remaining, limit: body.data.limit, blocked: body.data.blocked });
        }
      } catch {
        /* 네트워크 실패는 조용히 무시 — 이전 값 유지 */
      }
    }

    void fetchQuota();
    pollingRef.current = setInterval(() => { void fetchQuota(); }, 8_000);
    return () => {
      if (pollingRef.current !== null) clearInterval(pollingRef.current);
    };
  }, [runtime.attemptId]);

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

  // 카운트다운 만료: 화면은 즉시 차단(클라) + 서버에 마감 회수 알림(미제출도 패키징).
  // fire-and-forget — 실패해도 화면은 차단되고, close 스윕이 누락 안전망(서버가 deadline 재판정).
  function handleExpire() {
    setExpired(true);
    void fetch(`/api/exam/${runtime.attemptId}/expire`, { method: 'POST' }).catch(() => undefined);
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
          {quota !== null && (
            <Tag color={quota.blocked || quota.remaining === 0 ? 'red' : 'blue'}>
              AI {quota.remaining}/{quota.limit}회
            </Tag>
          )}
          <Countdown deadlineAt={runtime.deadlineAt} onExpire={handleExpire} />
          {ideReady && (
            <Button kind="ghost" size="sm" icon="launch" disabled={!ideUrl} onClick={() => ideUrl && window.open(ideUrl, '_blank', 'noopener')}>
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
          src={ideUrl ?? undefined}
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
