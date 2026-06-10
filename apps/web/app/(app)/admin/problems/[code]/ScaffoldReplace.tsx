'use client';
import { useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@app/ui';
import { useToast } from '@app/core';
import { replaceScaffoldAction } from './actions';

// 스캐폴드 교체(덮어쓰기) — 파일 선택 즉시 확인 다이얼로그 → 서버 액션.
// ⚠️ 버전 불변 원칙의 예외(업로드 실수 교정)라 confirm 문구로 영향 범위를 명시한다.

export function ScaffoldReplace({
  versionId,
  version,
  problemCode,
}: {
  versionId: string;
  version: number;
  problemCode: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  function onPick(file: File | null) {
    if (!file) return;
    const ok = window.confirm(
      `v${version}의 스캐폴드를 "${file.name}"(으)로 덮어씁니다.\n` +
        '이 버전을 쓰는 회차는 다음 "시험 환경 열기"부터 새 내용이 시드됩니다.\n' +
        '이미 응시가 끝난 회차의 재현성에 영향을 줄 수 있습니다. 계속할까요?',
    );
    if (!ok) {
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    const fd = new FormData();
    fd.set('file', file);
    startTransition(async () => {
      const r = await replaceScaffoldAction(versionId, problemCode, fd);
      toast(
        r.ok
          ? { kind: 'success', title: '스캐폴드 교체 완료', message: r.message }
          : { kind: 'error', title: '교체 실패', message: r.message },
      );
      if (inputRef.current) inputRef.current.value = '';
      if (r.ok) router.refresh();
    });
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".zip,.tgz,.tar.gz,application/zip,application/gzip"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
      <Button kind="ghost" size="field" icon="edit" disabled={pending} onClick={() => inputRef.current?.click()}>
        {pending ? '교체 중…' : `v${version} 교체`}
      </Button>
    </>
  );
}
