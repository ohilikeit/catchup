import { Icon } from '@app/ui';
import type { IconName } from '@app/ui';

// (exam) 전용 표현 부품. (app)/_components/ui.tsx와 상대경로 깊이가 달라 작은 것은 여기 자체 정의.
// 디자인 시스템 토큰만(raw 색상·임의 radius·이모지 금지). 샤프한 모서리.

/** 시험 화면 상단 바(셸이 아니라 최소 헤더). 과제·회차명 표시. */
export function ExamTopBar({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="border-b border-border-subtle-01 bg-layer-01">
      <div className="mx-auto max-w-[960px] px-06 py-04 flex items-center gap-03">
        <span className="text-icon-secondary">
          <Icon name="document" size={20} />
        </span>
        <div className="min-w-0">
          <div className="cds-heading-compact-02 text-text-primary truncate">{title}</div>
          {sub ? <div className="cds-helper-01 text-text-secondary truncate">{sub}</div> : null}
        </div>
      </div>
    </header>
  );
}

/**
 * ⭐ 모바일 비대상 안내(docs/1 §4). md 미만에서만 노출, md 이상에선 숨김.
 * 본문은 호출부에서 `hidden md:block`으로 감싸 짝을 이룬다.
 */
export function MobileBlock() {
  return (
    <div className="md:hidden flex flex-col items-center text-center gap-04 px-06 py-13">
      <span className="text-icon-secondary">
        <Icon name="warning-filled" size={32} />
      </span>
      <div className="cds-heading-compact-02 text-text-primary">PC에서 응시하세요</div>
      <p className="cds-body-01 text-text-secondary max-w-[40ch]">
        시험 화면은 데스크톱 환경에 최적화되어 있습니다. 노트북 또는 데스크톱 브라우저에서 다시 접속하세요.
      </p>
    </div>
  );
}

/** 평가 모듈 소관 화면의 자리표시(뼈대엔 placeholder). (app)/_components의 ComingSoon과 동형. */
export function ComingSoon({
  icon = 'time',
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
      <div className="cds-body-01 text-text-secondary mt-02 max-w-[48ch]">{message}</div>
    </div>
  );
}

/** 보더+layer 카드(그림자 없음 — 떠있는 레이어가 아니므로). */
export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-layer-02 border border-border-subtle-01 p-06 ${className}`}>{children}</div>
  );
}
