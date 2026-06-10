'use client';
import { useState, useTransition } from 'react';
import { Button } from '@app/ui';
import { useToast } from '@app/core';
import type { BatchStatus } from '@/lib/db/repositories/batches';
import { openBatchEnvAction, closeBatchEnvAction } from './actions';

// 회차 환경 제어 — "시험 환경 열기"(provision 0→N + open) / "회차 종료"(closed + teardown).
// 서버 액션이 k8s provision까지 수행하므로 수십 초가 걸릴 수 있다 — pending 동안 버튼 잠금.

export function BatchEnvControls({
  batchId,
  status,
  capacity,
}: {
  batchId: string;
  status: BatchStatus;
  capacity: number;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [phase, setPhase] = useState<'open' | 'close' | null>(null);

  function openEnv() {
    if (!window.confirm(`시험 환경을 엽니다 — 정원 ${capacity} 기준 선준비(가상키·라우팅) + 워밍 pod 기동.\n이전 회차의 워크스페이스(PVC)는 초기화됩니다. 계속할까요?`)) return;
    setPhase('open');
    startTransition(async () => {
      const r = await openBatchEnvAction(batchId);
      toast(
        r.ok
          ? { kind: 'success', title: '시험 환경 열림', message: r.message }
          : { kind: 'error', title: '환경 열기 실패', message: r.message },
      );
      setPhase(null);
    });
  }

  function closeEnv() {
    if (!window.confirm('회차를 종료합니다 — 신규 입장이 차단되고 pod이 회수됩니다. 계속할까요?')) return;
    setPhase('close');
    startTransition(async () => {
      const r = await closeBatchEnvAction(batchId);
      toast(
        r.ok
          ? { kind: 'success', title: '회차 종료', message: r.message }
          : { kind: 'warning', title: '종료됨(환경 회수 실패)', message: r.message },
      );
      setPhase(null);
    });
  }

  if (status === 'scheduled') {
    return (
      <Button kind="primary" size="field" disabled={pending} onClick={openEnv}>
        {pending && phase === 'open' ? '환경 준비 중…' : '시험 환경 열기'}
      </Button>
    );
  }
  if (status === 'open') {
    return (
      <Button kind="secondary" size="field" disabled={pending} onClick={closeEnv}>
        {pending && phase === 'close' ? '회수 중…' : '회차 종료'}
      </Button>
    );
  }
  return null;
}
