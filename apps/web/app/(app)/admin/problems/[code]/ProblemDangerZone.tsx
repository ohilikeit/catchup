'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Tag } from '@app/ui';
import { useToast } from '@app/core';
import { deleteProblemAction, setProblemActiveAction } from './actions';

// 문제 위험 구역(상세 하단) — 비활성화(소프트, 가역) + 삭제(하드, 미사용일 때만).
//  · 회차에 쓰인 문제는 삭제 불가(재현·이력 보존) → 비활성화로만 후보에서 내린다.
//  · 미사용 문제는 버전·MinIO 객체까지 완전 삭제. 가능 여부는 서버가 최종 판정.

export function ProblemDangerZone({
  code,
  title,
  isActive,
  usedByBatch,
}: {
  code: string;
  title: string;
  isActive: boolean;
  usedByBatch: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  function onToggleActive() {
    startTransition(async () => {
      const r = await setProblemActiveAction(code, !isActive);
      toast(
        r.ok
          ? { kind: 'success', title: '변경됨', message: r.message }
          : { kind: 'error', title: '변경 실패', message: r.message },
      );
      if (r.ok) router.refresh();
    });
  }

  function onDelete() {
    if (!window.confirm(`문제 "${title}"(${code})와 모든 버전·파일을 삭제합니다. 되돌릴 수 없습니다. 계속할까요?`)) return;
    startTransition(async () => {
      const r = await deleteProblemAction(code);
      if (r.ok) {
        toast({ kind: 'success', title: '문제 삭제됨', message: r.message });
        router.push('/admin/problems');
      } else {
        toast({ kind: 'error', title: '삭제할 수 없음', message: r.message });
      }
    });
  }

  return (
    <section className="border border-support-error p-05 mt-07">
      <div className="flex items-center gap-03">
        <h2 className="cds-heading-compact-02 text-support-error">위험 구역</h2>
        <Tag color={isActive ? 'green' : 'gray'}>{isActive ? '활성' : '비활성'}</Tag>
      </div>

      <div className="flex items-center justify-between gap-05 mt-04">
        <p className="cds-body-compact-01 text-text-secondary">
          {usedByBatch
            ? '회차에 사용된 문제입니다. 재현·이력 보존을 위해 삭제할 수 없고, 비활성화로 새 회차 후보에서만 내릴 수 있습니다.'
            : '아직 어떤 회차에도 쓰이지 않았습니다. 버전·파일까지 완전히 삭제할 수 있습니다.'}
        </p>
        <div className="flex items-center gap-02 shrink-0">
          <Button kind="secondary" size="field" disabled={pending} onClick={onToggleActive}>
            {isActive ? '비활성화' : '활성화'}
          </Button>
          {!usedByBatch && (
            <Button kind="danger" size="field" icon="trash" disabled={pending} onClick={onDelete}>
              {pending ? '삭제 중…' : '문제 삭제'}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
