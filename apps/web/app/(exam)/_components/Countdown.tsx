'use client';
import { useEffect, useState } from 'react';
import { Icon } from '@app/ui';

// 남은 시간 카운트다운. deadlineAt(ISO 문자열) 기준 클라 표시 — UX용.
// ⭐ 실제 만료 판정은 제출 API가 트랜잭션서 서버시각으로 재판정한다(여기 0은 안내일 뿐).
// onExpire는 0 도달 시 1회 호출(제출 버튼 비활성화 등).

function fmt(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function Countdown({
  deadlineAt,
  onExpire,
}: {
  deadlineAt: string | null;
  onExpire?: () => void;
}) {
  const target = deadlineAt ? new Date(deadlineAt).getTime() : null;
  const [remaining, setRemaining] = useState<number | null>(
    target === null ? null : target - Date.now(),
  );

  useEffect(() => {
    if (target === null) return;
    const tick = () => {
      const left = target - Date.now();
      setRemaining(left);
      if (left <= 0) onExpire?.();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const expired = remaining !== null && remaining <= 0;

  return (
    <div className="inline-flex items-center gap-02">
      <span className={expired ? 'text-support-error' : 'text-icon-secondary'}>
        <Icon name="time" size={16} />
      </span>
      <span
        className={`cds-code-01 tabular-nums ${
          expired ? 'text-support-error' : 'text-text-primary'
        }`}
      >
        {target === null ? '--:--:--' : fmt(remaining ?? 0)}
      </span>
    </div>
  );
}
