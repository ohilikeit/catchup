'use client';
import { useState } from 'react';
import { Button, Notification, Tag, Icon } from '@app/ui';
import { Countdown } from '../../_components/Countdown';
import { ComingSoon } from '../../_components/ExamChrome';

// (exam) 진행 화면 런타임 — 전달방식은 hosted 단일(docs/1 §4·§5).
// 부모(page.tsx 서버)가 status='running'만 통과시킨다.
// runtime은 서버에서 plain 직렬화해 전달(Date → ISO 문자열).

export interface ExamRuntimeData {
  attemptId: string;
  deadlineAt: string | null;
  problemTitle: string;
  batchName: string;
  publicScaffoldRef: string;
  scaffoldSha256: string;
}

/* ── hosted: 웹 IDE iframe 자리표시(이번 범위에서 백엔드 미구현) ──────────────── */
export function ExamRuntime({ runtime }: { runtime: ExamRuntimeData }) {
  const [expired, setExpired] = useState(false);
  return (
    <div className="flex flex-col gap-06">
      <RuntimeHeader
        runtime={runtime}
        onExpire={() => setExpired(true)}
        right={<Tag color="purple">호스팅</Tag>}
      />

      {/* iframe 래퍼 박스 모양만(실제 IDE는 호스팅 어댑터 연동 후). */}
      <div className="bg-layer-02 border border-border-subtle-01">
        <div className="border-b border-border-subtle-01 px-05 py-03 flex items-center gap-02">
          <span className="text-icon-secondary">
            <Icon name="data" size={16} />
          </span>
          <span className="cds-helper-01 text-text-secondary">웹 IDE</span>
        </div>
        <div className="px-06">
          <ComingSoon
            icon="time"
            title="호스팅 환경은 준비 중입니다"
            message="브라우저 안에서 바로 풀 수 있는 호스팅 IDE를 준비하고 있습니다. 현재 회차는 담당자 안내를 따르세요."
          />
        </div>
      </div>

      {expired ? (
        <Notification kind="warning" title="제한시간이 지났습니다">
          제출 가능 시간이 종료되었습니다. 최종 처리는 서버 기준으로 판정됩니다.
        </Notification>
      ) : null}

      <div className="flex justify-end">
        <Button kind="primary" icon="checkmark" disabled>
          제출
        </Button>
      </div>
    </div>
  );
}

/* ── 공통: 상단 메타 + 카운트다운 ─────────────────────────────────────────── */
function RuntimeHeader({
  runtime,
  onExpire,
  right,
}: {
  runtime: ExamRuntimeData;
  onExpire: () => void;
  right: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-04">
      <div className="flex items-center gap-03">{right}</div>
      <Countdown deadlineAt={runtime.deadlineAt} onExpire={onExpire} />
    </div>
  );
}
