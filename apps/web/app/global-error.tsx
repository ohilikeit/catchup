'use client';

import { useEffect } from 'react';
import { Button, Icon } from '@app/ui';
import './globals.css';

// 루트 레이아웃 자체가 터졌을 때의 최종 경계 — 자기 <html><body>를 직접 렌더해야 한다.
// 프로바이더(테마/토스트)가 실패 원인일 수 있으므로 의존하지 않는다. 토큰만으로
// 기본(light) 테마 화면을 그린다.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="ko">
      <body>
        <div className="min-h-dvh flex items-center px-05 lg:px-07 bg-background">
          <div className="max-w-[480px]">
            <span className="text-support-error block mb-04">
              <Icon name="warning-filled" size={32} />
            </span>
            <h1 className="cds-heading-05 text-text-primary">문제가 발생했습니다</h1>
            <p className="cds-body-02 text-text-secondary mt-04">
              페이지를 표시하는 중 예기치 않은 오류가 발생했습니다. 다시 시도해 주세요.
            </p>
            {error.digest ? (
              <p className="cds-code-01 text-text-helper mt-04">참조 코드: {error.digest}</p>
            ) : null}
            <div className="mt-07">
              <Button kind="primary" icon="arrow-right" onClick={() => reset()}>
                다시 시도
              </Button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
