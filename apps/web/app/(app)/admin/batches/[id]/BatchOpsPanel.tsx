import { Tag } from '@app/ui';
import type { BatchOpsSnapshot } from '@/lib/services/examOpsService';
import type { SlotState } from '@/lib/db/repositories/slots';

// 회차 운영 관제 패널(admin 상세, open 회차) — 슬롯 상태 분포 + LLM 사용액(spend).
// 순수 표현형(서버 호환): 데이터는 page(서버)가 examOpsService.batchOpsSnapshot 으로 가져와 prop 으로 넘긴다.
// docs/6 Phase 3 1d 관제: 슬롯 현황(hosted.slots) + spend(/key/info).

// 상태별 색상 — 디자인 시스템 Tag color 토큰만 사용(raw 색상 금지).
const STATE_META: Record<SlotState, { label: string; color: 'green' | 'blue' | 'purple' | 'gray' | 'teal' }> = {
  ready: { label: '대기(ready)', color: 'green' },
  assigned: { label: '응시 중', color: 'blue' },
  submitting: { label: '제출 중', color: 'purple' },
  recycling: { label: '재활용', color: 'teal' },
  warming: { label: '기동 중', color: 'gray' },
  down: { label: '내려감', color: 'gray' },
};
const STATE_ORDER: SlotState[] = ['assigned', 'submitting', 'ready', 'warming', 'recycling', 'down'];

export function BatchOpsPanel({ ops }: { ops: BatchOpsSnapshot }) {
  const counts = ops.slots.reduce<Record<string, number>>((acc, s) => {
    acc[s.state] = (acc[s.state] ?? 0) + 1;
    return acc;
  }, {});
  const budgetLabel = ops.batchBudgetUsd == null ? '상한 없음' : `$${ops.batchBudgetUsd.toFixed(2)}`;

  return (
    <section className="bg-layer-01 border border-border-subtle-01 p-05 mb-07">
      <div className="flex flex-wrap items-center justify-between gap-04 mb-04">
        <h2 className="cds-heading-compact-02 text-text-primary min-w-0">실시간 관제</h2>
        <span className="cds-helper-01 text-text-secondary shrink-0">
          슬롯 {ops.slots.length}개 · 회차 예산 {budgetLabel}
        </span>
      </div>

      {/* 슬롯 상태 분포 */}
      <div className="flex flex-wrap items-center gap-03 mb-05">
        {STATE_ORDER.filter((st) => counts[st]).map((st) => (
          <Tag key={st} color={STATE_META[st].color}>
            {STATE_META[st].label} {counts[st]}
          </Tag>
        ))}
        {ops.slots.length === 0 && (
          <span className="cds-body-compact-01 text-text-secondary">아직 등록된 슬롯이 없습니다.</span>
        )}
      </div>

      {/* LLM 사용액 */}
      <div className="border-t border-border-subtle-01 pt-04">
        <div className="flex items-baseline gap-03">
          <span className="cds-label-01 text-text-secondary">LLM 누적 사용액</span>
          <span className="cds-heading-04 text-text-primary tabular-nums">
            ${ops.totalSpendUsd.toFixed(2)}
          </span>
        </div>
        {!ops.reachable && (
          <p className="cds-helper-01 text-support-warning mt-02">
            게이트웨이 응답이 없어 사용액을 집계하지 못했습니다(키 만료·게이트웨이 점검 가능).
          </p>
        )}
      </div>
    </section>
  );
}
