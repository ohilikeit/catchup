import { cn } from '../lib/cn';

// Carbon 스켈레톤 — 콘텐츠 도착 전 레이아웃 모양을 미리 점유해 시프트(CLS)를 막는다.
// 플랫 사각형(샤프 코너), 떠있지 않으므로 그림자 없음. 펄스는 motion-reduce에서 멈춘다.
// 시각 블록은 aria-hidden; 로딩 안내는 호출부에서 sr-only 텍스트로 전달한다.

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

/** 단일 스켈레톤 블록. 크기는 className으로(h-*, w-*) 지정. */
export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'bg-layer-accent-01 animate-pulse motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  );
}

export interface SkeletonTextProps {
  /** 줄 수(기본 3). 마지막 줄은 짧게 렌더해 자연스러운 문단 모양. */
  lines?: number;
  className?: string;
}

/** 본문 텍스트 자리표시 — 여러 줄, 마지막 줄은 60% 폭. */
export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div className={cn('flex flex-col gap-03', className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn('h-04', i === lines - 1 ? 'w-3/5' : 'w-full')}
        />
      ))}
    </div>
  );
}
