'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button, Icon } from '@app/ui';

// 세그먼트 런타임 에러 경계(클라이언트 컴포넌트 필수). reset()으로 같은 세그먼트를
// 재렌더 시도. 상태는 고정 support 4종(error) + filled 아이콘으로만 표현 — Carbon 규칙.
// 카피는 비난 없이 사실 위주, 느낌표 없음.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 운영 환경에선 관측 파이프라인으로 보낼 자리(현재는 콘솔로 기록).
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-dvh flex items-center px-05 lg:px-07 bg-background">
      <div className="max-w-[480px]">
        <span className="text-support-error block mb-04">
          <Icon name="warning-filled" size={32} />
        </span>
        <h1 className="cds-heading-05 text-text-primary">화면을 불러오지 못했습니다</h1>
        <p className="cds-body-02 text-text-secondary mt-04">
          일시적인 문제일 수 있습니다. 다시 시도하거나, 계속되면 잠시 후 다시 접속하세요.
        </p>
        {error.digest ? (
          <p className="cds-code-01 text-text-helper mt-04">참조 코드: {error.digest}</p>
        ) : null}
        <div className="flex flex-wrap gap-04 mt-07">
          <Button kind="primary" icon="arrow-right" onClick={() => reset()}>
            다시 시도
          </Button>
          <Button kind="tertiary" asChild>
            <Link href="/">홈으로</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
