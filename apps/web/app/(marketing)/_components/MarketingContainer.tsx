import { cn } from '@app/ui';

// 마케팅 공유 컨테이너 — 헤더와 모든 페이지 콘텐츠가 같은 좌/우 경계를 공유하는 단일 기준.
// 고정 max-width + 고정 패딩(뷰포트 비례 px-[10%] 안티패턴 대체). full-bleed 밴드 안에 넣으면
// 배경은 끝까지, 콘텐츠는 이 컬럼에 정렬된다.
export function MarketingContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mx-auto w-full max-w-[1120px] px-06 md:px-08', className)}>{children}</div>
  );
}
