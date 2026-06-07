'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Notification } from '@app/ui';

// 시험 시작 버튼(클라). POST start API → 성공 시 진행 화면으로. 서버가 deadline_at을 박는다.

export function StartExamButton({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/exam/${attemptId}/start`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok || !body?.success) {
        setError(body?.error?.message ?? '시험을 시작할 수 없습니다.');
        setLoading(false);
        return;
      }
      router.push(`/exam/${attemptId}`);
    } catch {
      setError('네트워크 오류로 시작에 실패했습니다. 다시 시도하세요.');
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-04">
      {error ? (
        <Notification kind="error" title="시작 실패">
          {error}
        </Notification>
      ) : null}
      <Button kind="primary" icon="arrow-right" disabled={loading} onClick={start}>
        {loading ? '시작하는 중…' : '시험 시작'}
      </Button>
    </div>
  );
}
