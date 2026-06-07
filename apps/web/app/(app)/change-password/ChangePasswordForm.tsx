'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Notification } from '@app/ui';
import { useToast } from '@app/core';
import { changePasswordAction } from './actions';

// 비밀번호 변경 폼(클라이언트). 현재/새/확인 → server action. 성공 시 세션 갱신 + 홈 이동.

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError('새 비밀번호와 확인이 일치하지 않습니다.');
      return;
    }
    startTransition(async () => {
      const res = await changePasswordAction(current, next);
      if (res.ok) {
        toast({ kind: 'success', title: '비밀번호가 변경되었습니다.', message: '다음 로그인부터 새 비밀번호를 사용하세요.' });
        router.refresh(); // 세션 쿠키 갱신 반영(배너 제거)
        router.push('/');
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-05">
      {forced && (
        <Notification kind="warning" title="임시 비밀번호 변경 필요">
          보안을 위해 임시 비밀번호를 본인만 아는 비밀번호로 바꿔 주세요.
        </Notification>
      )}
      {error && (
        <Notification kind="error" title="변경 실패">
          {error}
        </Notification>
      )}
      <Field label="현재 비밀번호">
        <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </Field>
      <Field label="새 비밀번호" helper="8자 이상.">
        <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} required />
      </Field>
      <Field label="새 비밀번호 확인">
        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </Field>
      <Button kind="primary" type="submit" icon="checkmark" disabled={pending}>
        {pending ? '변경 중...' : '비밀번호 변경'}
      </Button>
    </form>
  );
}
