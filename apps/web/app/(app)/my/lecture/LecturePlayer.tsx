'use client';
import { useState } from 'react';
import { Icon, Tag, Notification, Button } from '@app/ui';

// 강의 플레이어(목데이터). 동영상 실제 연동 전의 껍데기 — 챕터 선택 상호작용만 동작.
// 추후: src를 실제 스트리밍 URL로, 진도(watched)를 서버 저장으로 교체.

interface Chapter {
  no: number;
  title: string;
  length: string;
  done: boolean;
}

const LECTURE = {
  title: '바이브코딩 입문 — AI로 내 업무 자동화하기',
  instructor: 'CatchUP 교육팀',
  durationLabel: '총 2시간 12분',
  chapters: [
    { no: 1, title: '오리엔테이션 — 평가는 어떻게 진행되나', length: '08:24', done: true },
    { no: 2, title: 'AI 협업의 기본 — 프롬프트와 반복', length: '21:10', done: true },
    { no: 3, title: '기획 직무 과제 풀이 데모', length: '34:52', done: false },
    { no: 4, title: '산출물 정리와 제출 준비', length: '18:40', done: false },
    { no: 5, title: '자주 하는 실수와 체크리스트', length: '12:05', done: false },
  ] as Chapter[],
};

export function LecturePlayer() {
  const [activeNo, setActiveNo] = useState(3);
  const active = LECTURE.chapters.find((c) => c.no === activeNo) ?? LECTURE.chapters[0]!;
  const doneCount = LECTURE.chapters.filter((c) => c.done).length;

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-05 items-start">
      {/* 동영상 영역 + 정보 */}
      <div className="flex flex-col gap-04 min-w-0">
        <div className="relative aspect-video bg-shell flex flex-col items-center justify-center text-shell-text">
          <span className="flex items-center justify-center w-16 h-16 border border-shell-text-muted text-shell-text">
            <Icon name="view" size={28} />
          </span>
          <div className="mt-04 cds-heading-compact-02">{active.no}강 · {active.title}</div>
          <div className="mt-01 font-mono text-xs text-shell-text-muted">{active.length} · 샘플(mock) 영상</div>
        </div>

        <div className="flex items-start justify-between gap-04">
          <div className="min-w-0">
            <h2 className="cds-heading-04 text-text-primary">{LECTURE.title}</h2>
            <p className="cds-body-01 text-text-secondary mt-01">{LECTURE.instructor} · {LECTURE.durationLabel}</p>
          </div>
          <Button kind="primary" size="field" icon="view">이어보기</Button>
        </div>

        <Notification kind="info" title="예시(mock) 강의입니다.">
          실제 동영상·진도 저장은 추후 연동됩니다. 지금은 화면 구성만 보여줍니다.
        </Notification>
      </div>

      {/* 챕터 목록 */}
      <aside className="bg-layer-02 border border-border-subtle-01">
        <div className="flex items-center justify-between px-05 h-12 border-b border-border-subtle-01">
          <h3 className="cds-heading-compact-02 text-text-primary">커리큘럼</h3>
          <span className="cds-helper-01 text-text-secondary">{doneCount}/{LECTURE.chapters.length} 완료</span>
        </div>
        <ul>
          {LECTURE.chapters.map((c) => {
            const isActive = c.no === activeNo;
            return (
              <li key={c.no}>
                <button
                  type="button"
                  onClick={() => setActiveNo(c.no)}
                  className={`w-full flex items-center gap-03 px-05 py-04 text-left border-b border-border-subtle-01 last:border-0 hover:bg-layer-hover-01 ${isActive ? 'bg-gray-20' : ''}`}
                >
                  <span className={`flex-[0_0_auto] ${c.done ? 'text-support-success' : 'text-icon-secondary'}`}>
                    <Icon name={c.done ? 'checkmark-filled' : 'view'} size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block cds-body-01 truncate ${isActive ? 'text-text-primary font-semibold' : 'text-text-primary'}`}>
                      {c.no}. {c.title}
                    </span>
                    <span className="block cds-helper-01 text-text-secondary mt-[2px]">{c.length}</span>
                  </span>
                  {isActive && <Tag color="blue">재생 중</Tag>}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}
