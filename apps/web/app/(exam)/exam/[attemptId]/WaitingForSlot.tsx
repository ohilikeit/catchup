'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@app/ui';

// 워밍 풀 대기 화면 — ready 슬롯이 없을 때 전원에게 제공(docs/6 Phase 3 라이브 입장).
// 2초 폴링(slot-status)이 곧 reconcile tick: 풀 보충·큐 배정이 이 폴링으로 굴러간다.
// 배정되면 router.refresh() → 서버가 슬롯 포함으로 재렌더 → IDE 자동 진입.
// (WebSocket 비채택 — 이 인프라에서 web 경유 WS는 실측 502. docs/6 Phase 3 결정.)

interface SlotStatus {
  assigned: boolean;
  slotNo?: number;
  status?: string;
  position?: number | null;
  podsReady?: number;
  podsStarting?: number;
}

export function WaitingForSlot({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const [st, setSt] = useState<SlotStatus | null>(null);
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    let stopped = false;
    async function tick() {
      try {
        const res = await fetch(`/api/exam/${attemptId}/slot-status`, { cache: 'no-store' });
        const body = await res.json();
        if (stopped) return;
        if (body?.success) {
          setUnreachable(false);
          setSt(body.data as SlotStatus);
          if ((body.data as SlotStatus).assigned) {
            router.refresh(); // 서버 재렌더 → 배정된 슬롯의 IDE로 전환
          }
        } else {
          setUnreachable(true);
        }
      } catch {
        if (!stopped) setUnreachable(true);
      }
    }
    tick();
    const id = setInterval(tick, 2000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [attemptId, router]);

  const waitingInQueue = st?.position != null && st.position > 0;
  const starting = (st?.podsStarting ?? 0) > 0;

  // 단계: ① 입장 접수(완료) → ② 환경 준비(현재) → ③ 입장(대기)
  const stageLabel = waitingInQueue
    ? `대기열 ${st!.position}번째 — 차례가 되면 자동으로 입장합니다`
    : starting
      ? '시험 환경을 기동하고 문제를 설치하는 중입니다'
      : '시험 환경을 준비하는 중입니다';

  return (
    <div className="flex-1 flex items-center justify-center px-06">
      <div className="bg-layer-02 border border-border-subtle-01 px-09 py-09 max-w-[480px] w-full">
        <div className="flex items-center gap-03 mb-05">
          <span className="text-icon-secondary">
            <Icon name="time" size={24} />
          </span>
          <span className="cds-heading-compact-02 text-text-primary">시험 환경 준비 중</span>
        </div>

        <ol className="flex flex-col gap-03 mb-06">
          <li className="flex items-center gap-03 cds-body-compact-01 text-text-secondary">
            <span className="text-support-success"><Icon name="checkmark-filled" size={16} /></span>
            입장 접수 완료
          </li>
          <li className="flex items-center gap-03 cds-body-compact-01 text-text-primary">
            <span className="inline-block w-[8px] h-[8px] bg-interactive animate-pulse" aria-hidden />
            {stageLabel}
          </li>
          <li className="flex items-center gap-03 cds-body-compact-01 text-text-secondary">
            <span className="inline-block w-[8px] h-[8px] border border-border-strong-01" aria-hidden />
            준비가 끝나면 자동으로 IDE에 입장합니다
          </li>
        </ol>

        <div className="cds-helper-01 text-text-secondary border-t border-border-subtle-01 pt-04">
          준비된 환경 {st?.podsReady ?? 0} · 기동 중 {st?.podsStarting ?? 0}
          {unreachable ? ' · 상태 확인 재시도 중…' : ''}
        </div>
        <p className="cds-helper-01 text-text-secondary mt-03">
          이 화면을 닫아도 자리는 유지됩니다 — 다시 접속하면 이어집니다. 제한시간은 입장 시점부터 계산됩니다.
        </p>
      </div>
    </div>
  );
}
