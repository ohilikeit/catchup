import type { Metadata } from 'next';
import { requireSession } from '@/lib/auth/guard';
import { PageHead } from '../_components/ui';
import { ChangePasswordForm } from './ChangePasswordForm';

export const metadata: Metadata = { title: '비밀번호 변경' };

// 비밀번호 변경 화면. 첫 로그인(임시비번) 변경 + 일반 변경 겸용. 모든 로그인 사용자 접근.

export default async function ChangePasswordPage() {
  const session = await requireSession();
  return (
    <div className="max-w-[480px]">
      <PageHead
        title="비밀번호 변경"
        sub={
          session.mustChangePassword
            ? '임시 비밀번호로 로그인했습니다. 본인 비밀번호로 변경하세요.'
            : '계정 비밀번호를 변경합니다.'
        }
      />
      <ChangePasswordForm forced={session.mustChangePassword ?? false} />
    </div>
  );
}
