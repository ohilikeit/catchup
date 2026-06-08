import { Icon, Tag } from '@app/ui';
import type { IconName } from '@app/ui';

// (app) 셸 페이지 공용 표현 부품. 디자인 시스템 토큰만 사용(raw 색상·임의 radius 금지).
// console 프로토타입의 PageHead/EmptyState 패턴을 정식 부품으로 승격.

export function PageHead({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-04 mb-07">
      <div>
        <h1 className="cds-heading-05 text-text-primary">{title}</h1>
        {sub ? <p className="cds-body-01 text-text-secondary mt-02">{sub}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** 빈 상태(0명·미시작). 로딩/에러와 함께 모든 상태 화면의 한 축(docs/1 §4 체크리스트). */
export function EmptyState({
  icon = 'folder',
  title,
  message,
}: {
  icon?: IconName;
  title: string;
  message: string;
}) {
  return (
    <div className="bg-layer-02 border border-border-subtle-01 py-13 flex flex-col items-center text-center">
      <span className="text-icon-secondary">
        <Icon name={icon} size={32} />
      </span>
      <div className="cds-heading-compact-02 text-text-primary mt-04">{title}</div>
      <div className="cds-body-01 text-text-secondary mt-02 max-w-[44ch]">{message}</div>
    </div>
  );
}

/** 평가 모듈 소관 화면의 자리표시(뼈대엔 placeholder, docs/1 §6). */
export function ComingSoon({ title, message }: { title: string; message: string }) {
  return (
    <div className="bg-layer-02 border border-border-subtle-01 py-13 flex flex-col items-center text-center">
      <span className="text-icon-secondary">
        <Icon name="time" size={32} />
      </span>
      <div className="cds-heading-compact-02 text-text-primary mt-04">{title}</div>
      <div className="cds-body-01 text-text-secondary mt-02 max-w-[48ch]">{message}</div>
    </div>
  );
}

/** 간단한 카드(보더 + layer 배경). 그림자 없음(떠있는 레이어가 아니므로). */
export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-layer-02 border border-border-subtle-01 p-06 ${className}`}>{children}</div>;
}

/* ── 도메인 상태 배지(고정 매핑 — 여러 페이지 공유) ───────────────────── */

type TagColor = 'gray' | 'blue' | 'green' | 'red' | 'purple' | 'teal';

const ATTEMPT: Record<string, { label: string; color: TagColor; icon?: IconName }> = {
  ready: { label: '대기', color: 'gray', icon: 'time' },
  running: { label: '진행중', color: 'blue', icon: 'time' },
  submitted: { label: '제출완료', color: 'green', icon: 'checkmark-filled' },
  expired: { label: '만료', color: 'red', icon: 'warning-filled' },
  void: { label: '무효', color: 'gray' },
};

export function AttemptStatusTag({ status }: { status: string }) {
  const s = ATTEMPT[status] ?? { label: status, color: 'gray' as TagColor };
  return <Tag color={s.color} icon={s.icon}>{s.label}</Tag>;
}

const SUBMISSION: Record<string, { label: string; color: TagColor; icon?: IconName }> = {
  received: { label: '수신', color: 'gray' },
  validating: { label: '검증중', color: 'blue', icon: 'time' },
  accepted: { label: '승인', color: 'green', icon: 'checkmark-filled' },
  rejected: { label: '거부', color: 'red', icon: 'error-filled' },
};

export function SubmissionStatusTag({ status }: { status: string | null }) {
  if (!status) return <Tag color="gray">미제출</Tag>;
  const s = SUBMISSION[status] ?? { label: status, color: 'gray' as TagColor };
  return <Tag color={s.color} icon={s.icon}>{s.label}</Tag>;
}

export function TrustTag({ trust }: { trust: string }) {
  // 전달 경로는 hosted(proxy) 단일 → 제출은 항상 검증됨(verified). 방어적으로 라벨만 분기.
  return trust === 'verified' ? (
    <Tag color="green" icon="checkmark-filled">검증됨</Tag>
  ) : (
    <Tag color="gray">{trust}</Tag>
  );
}

const BATCH: Record<string, { label: string; color: TagColor }> = {
  scheduled: { label: '예정', color: 'gray' },
  open: { label: '진행', color: 'green' },
  closed: { label: '종료', color: 'gray' },
};

export function BatchStatusTag({ status }: { status: string }) {
  const s = BATCH[status] ?? { label: status, color: 'gray' as TagColor };
  return <Tag color={s.color}>{s.label}</Tag>;
}
