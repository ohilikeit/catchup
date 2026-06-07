import Link from 'next/link';
import { Button, Icon } from '@app/ui';
import { MarketingContainer } from '../_components/MarketingContainer';

const STEPS = [
  {
    num: '01',
    title: '로그인',
    desc: '발급된 계정으로 로그인합니다. 학교·기관을 통해 미리 계정이 생성됩니다.',
    icon: 'user' as const,
  },
  {
    num: '02',
    title: '사전 강의 수강',
    desc: '2~3시간 바이브코딩 강의를 수강합니다. AI 툴 사용법과 과제 유형을 익힙니다.',
    icon: 'document' as const,
  },
  {
    num: '03',
    title: '시험 안내 확인',
    desc: '시작 전 안내 화면에서 진행 규칙, 제출 형식, 환경을 점검합니다.',
    icon: 'checkmark-filled' as const,
  },
  {
    num: '04',
    title: 'AI 협업으로 과제 풀기',
    desc: '직무별 실무 과제를 AI 도구와 협업해 풉니다. AI와 나눈 대화 전체가 평가 대상입니다.',
    icon: 'analytics' as const,
  },
  {
    num: '05',
    title: '산출물 제출',
    desc: '완성한 결과물을 시스템에 제출합니다. 제출 후에는 수정이 불가합니다.',
    icon: 'folder' as const,
  },
  {
    num: '06',
    title: '평가 및 리포트 수령',
    desc: 'AI 채팅 평가(50) + 결과 평가(50)를 합산한 리포트가 제공됩니다.',
    icon: 'data' as const,
  },
];

export default function HowItWorksPage() {
  return (
    <MarketingContainer className="py-11">
      <div className="mb-09">
        <p className="cds-label-01 text-text-secondary mb-03 uppercase tracking-widest">
          시험 진행 방식
        </p>
        <h1 className="cds-heading-06 text-text-primary mb-04">
          로그인부터 리포트까지 6단계
        </h1>
        <p className="cds-body-02 text-text-secondary max-w-[520px]">
          전 과정이 하루 안에 완결됩니다.
          사전 강의 → 과제 → 제출 → 리포트 순서로 진행됩니다.
        </p>
      </div>

      <div className="flex flex-col gap-0">
        {STEPS.map((step, idx) => (
          <div
            key={step.num}
            className="flex gap-06 bg-layer-01 border border-border-subtle-01 p-06 -mt-px first:mt-0"
          >
            <div className="flex-shrink-0 w-10 h-10 bg-background border border-border-subtle-01 flex items-center justify-center">
              <span className="font-mono text-xs font-semibold text-text-secondary">{step.num}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-03 mb-02">
                <span className="text-icon-secondary">
                  <Icon name={step.icon} size={16} />
                </span>
                <span className="cds-heading-compact-02 text-text-primary">{step.title}</span>
              </div>
              <p className="cds-body-01 text-text-secondary">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-09 border-t border-border-subtle-01 pt-07">
        <h2 className="cds-heading-04 text-text-primary mb-03">준비됐다면 로그인하세요.</h2>
        <p className="cds-body-01 text-text-secondary mb-06">
          계정은 소속 학교·기관을 통해 발급됩니다.
        </p>
        <div className="flex flex-wrap gap-04">
          <Button kind="primary" icon="arrow-right" asChild>
            <Link href="/login">로그인</Link>
          </Button>
          <Button kind="ghost" asChild>
            <Link href="/sample-report">샘플 리포트 보기</Link>
          </Button>
        </div>
      </div>
    </MarketingContainer>
  );
}
