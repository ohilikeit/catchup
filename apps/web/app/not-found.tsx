import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@app/ui';

export const metadata: Metadata = {
  title: '페이지를 찾을 수 없습니다 · CatchUP',
};

// 루트 404 — 미매칭 라우트·notFound() 공통 처리. 마케팅 셸 밖에서 렌더되므로
// 자체 완결형. Carbon 에러 화면은 타이포그래피 중심(큰 제목은 light weight),
// 그라디언트·일러스트 없음. 사용자에게 항상 돌아갈 길을 준다.
export default function NotFound() {
  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <header className="h-12 flex items-center px-05 lg:px-07 border-b border-border-subtle-01">
        <Link href="/" className="cds-heading-compact-02 text-text-primary no-underline">
          CatchUP
        </Link>
      </header>
      <main className="flex-1 flex items-center px-05 lg:px-07">
        <div className="max-w-[480px]">
          <p className="cds-label-01 text-text-secondary mb-03">오류 404</p>
          <h1 className="cds-heading-06 text-text-primary">페이지를 찾을 수 없습니다</h1>
          <p className="cds-body-02 text-text-secondary mt-05">
            요청한 주소가 바뀌었거나 삭제되었을 수 있습니다. 주소를 다시 확인하거나
            아래에서 이동하세요.
          </p>
          <div className="flex flex-wrap gap-04 mt-07">
            <Button kind="primary" icon="arrow-right" asChild>
              <Link href="/">홈으로</Link>
            </Button>
            <Button kind="tertiary" asChild>
              <Link href="/login">로그인</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
