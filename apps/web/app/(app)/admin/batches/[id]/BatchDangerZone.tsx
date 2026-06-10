'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@app/ui';
import { useToast } from '@app/core';
import type { BatchStatus } from '@/lib/db/repositories/batches';
import { deleteBatchAction, cancelBatchAction } from './actions';

// 회차 위험 구역(상세 하단) — 파괴/종단 액션을 한 곳에 모아 실수 방지(목록의 원클릭과 분리).
//  · 하드 삭제: scheduled + 응시 0 일 때만(이력 보존 불변식). 성공 시 목록으로 이동.
//  · 취소(cancelled, 소프트): 이력 있는 회차를 내릴 때. open이면 환경 회수(close)를 먼저.
// 가능 여부는 서버(batchService)가 최종 판정 — 여기 노출 규칙은 UX 힌트일 뿐.

export function BatchDangerZone({
  batchId,
  status,
  name,
  attemptCount,
}: {
  batchId: string;
  status: BatchStatus;
  name: string;
  attemptCount: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const canHardDelete = status === 'scheduled' && attemptCount === 0;
  const canCancel = status !== 'cancelled' && !canHardDelete; // 삭제 가능하면 굳이 취소 안 보임

  if (status === 'cancelled') {
    return (
      <section className="border border-border-subtle-01 p-05 mt-07">
        <h2 className="cds-heading-compact-02 text-text-secondary">위험 구역</h2>
        <p className="cds-body-compact-01 text-text-secondary mt-02">이 회차는 취소되었습니다.</p>
      </section>
    );
  }

  function onDelete() {
    if (!window.confirm(`회차 "${name}"을(를) 삭제합니다. 되돌릴 수 없습니다. 계속할까요?`)) return;
    startTransition(async () => {
      const r = await deleteBatchAction(batchId);
      if (r.ok) {
        toast({ kind: 'success', title: '회차 삭제됨', message: r.message });
        router.push('/admin/batches');
      } else {
        toast({ kind: 'error', title: '삭제할 수 없음', message: r.message });
      }
    });
  }

  function onCancel() {
    if (
      !window.confirm(
        `회차 "${name}"을(를) 취소합니다. 신규 입장이 막히고${status === 'open' ? ' 진행 중 환경이 회수되며' : ''} 목록에서 취소 상태로 표시됩니다. 계속할까요?`,
      )
    )
      return;
    startTransition(async () => {
      const r = await cancelBatchAction(batchId);
      toast(
        r.ok
          ? { kind: 'success', title: '회차 취소됨', message: r.message }
          : { kind: 'error', title: '취소 실패', message: r.message },
      );
      if (r.ok) router.refresh();
    });
  }

  return (
    <section className="border border-support-error p-05 mt-07">
      <h2 className="cds-heading-compact-02 text-support-error">위험 구역</h2>
      <div className="flex items-center justify-between gap-05 mt-04">
        <p className="cds-body-compact-01 text-text-secondary">
          {canHardDelete
            ? '아직 시작하지 않았고 응시자가 없는 회차입니다. 완전히 삭제할 수 있습니다.'
            : '응시 이력이 있어 삭제할 수 없습니다. 회차를 취소(소프트)하여 내릴 수 있습니다.'}
        </p>
        {canHardDelete && (
          <Button kind="danger" size="field" icon="trash" disabled={pending} onClick={onDelete}>
            {pending ? '삭제 중…' : '회차 삭제'}
          </Button>
        )}
        {canCancel && (
          <Button kind="danger" size="field" disabled={pending} onClick={onCancel}>
            {pending ? '취소 중…' : '회차 취소'}
          </Button>
        )}
      </div>
    </section>
  );
}
