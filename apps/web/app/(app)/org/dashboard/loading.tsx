import { Skeleton } from '@app/ui';
import { MetricGridSkeleton } from '../../_components/ui';

export default function Loading() {
  return (
    <div aria-busy="true">
      <div className="mb-07">
        <Skeleton className="h-07 w-40" />
        <Skeleton className="h-04 w-64 mt-03" />
      </div>
      <MetricGridSkeleton />
      <div className="grid lg:grid-cols-2 gap-05">
        {[0, 1].map((i) => (
          <div key={i} className="bg-layer-02 border border-border-subtle-01">
            <div className="h-12 border-b border-border-subtle-01 px-05 flex items-center">
              <Skeleton className="h-04 w-24" />
            </div>
            {[0, 1, 2].map((j) => (
              <div
                key={j}
                className="h-14 border-b border-border-subtle-01 last:border-0 px-05 flex items-center"
              >
                <Skeleton className="h-04 w-2/3" />
              </div>
            ))}
          </div>
        ))}
      </div>
      <span className="sr-only">불러오는 중</span>
    </div>
  );
}
