import Link from 'next/link';
import { Button, Icon, Notification } from '@app/ui';
import { MarketingContainer } from '../_components/MarketingContainer';

export default function CurriculumPage() {
  return (
    <MarketingContainer className="py-11">
      <div className="mb-09">
        <p className="cds-label-01 text-text-secondary mb-03 uppercase tracking-widest">
          커리큘럼
        </p>
        <h1 className="cds-heading-06 text-text-primary mb-04">
          바이브코딩 강의 소개
        </h1>
        <p className="cds-body-02 text-text-secondary max-w-[520px]">
          평가 전 필수 수강 과정입니다. 2~3시간 강의에서 AI 툴 사용법과
          직무 과제 유형을 익힙니다.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-05 mb-09">
        {/* 강의 개요 */}
        <div className="bg-layer-01 border border-border-subtle-01 p-06">
          <div className="flex items-center gap-03 mb-04">
            <span className="text-icon-primary">
              <Icon name="time" size={20} />
            </span>
            <span className="cds-heading-compact-02 text-text-primary">강의 개요</span>
          </div>
          <div className="flex flex-col gap-04">
            <div className="flex items-start gap-03">
              <span className="cds-label-01 text-text-secondary mt-[2px] flex-shrink-0 w-16">시간</span>
              <span className="cds-body-01 text-text-primary">2~3시간 (집중 강의)</span>
            </div>
            <div className="flex items-start gap-03">
              <span className="cds-label-01 text-text-secondary mt-[2px] flex-shrink-0 w-16">형식</span>
              <span className="cds-body-01 text-text-primary">실습 위주 강의 + Q&A</span>
            </div>
            <div className="flex items-start gap-03">
              <span className="cds-label-01 text-text-secondary mt-[2px] flex-shrink-0 w-16">대상</span>
              <span className="cds-body-01 text-text-primary">비개발 직무(기획, 마케팅, 운영 등)</span>
            </div>
            <div className="flex items-start gap-03">
              <span className="cds-label-01 text-text-secondary mt-[2px] flex-shrink-0 w-16">선수</span>
              <span className="cds-body-01 text-text-primary">없음. 코딩 경험 불필요</span>
            </div>
          </div>
        </div>

        {/* 학습 목표 */}
        <div className="bg-layer-01 border border-border-subtle-01 p-06">
          <div className="flex items-center gap-03 mb-04">
            <span className="text-icon-primary">
              <Icon name="checkmark-filled" size={20} />
            </span>
            <span className="cds-heading-compact-02 text-text-primary">학습 목표</span>
          </div>
          <ul className="flex flex-col gap-03">
            {[
              'AI 툴(ChatGPT, Claude 등)로 실무 문서 작성하기',
              '프롬프트를 구체적으로 구성하는 방법 이해하기',
              '반복 피드백으로 결과물 개선하기',
              '직무 과제에 AI를 적용하는 패턴 습득하기',
            ].map((item) => (
              <li key={item} className="flex items-start gap-03">
                <span className="text-icon-secondary mt-[3px] flex-shrink-0">
                  <Icon name="checkmark-filled" size={14} />
                </span>
                <span className="cds-body-01 text-text-primary">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 강의 구성 */}
      <h2 className="cds-heading-04 text-text-primary mb-05">강의 구성</h2>
      <div className="flex flex-col gap-0 mb-09">
        {[
          {
            part: 'Part 1',
            title: 'AI 툴 기초 및 환경 설정',
            duration: '30분',
            desc: '사용할 AI 툴 소개, 계정 설정, 기본 인터페이스 익히기.',
          },
          {
            part: 'Part 2',
            title: '프롬프트 작성 원리',
            duration: '45분',
            desc: '좋은 프롬프트의 조건: 역할 부여, 맥락 제공, 형식 지정. 실습 예시 포함.',
          },
          {
            part: 'Part 3',
            title: '직무 과제 유형 실습',
            duration: '60분',
            desc: '기획서 작성, 데이터 정리, 보고서 초안 등 직무별 실무 과제를 AI로 풀어보는 실습.',
          },
          {
            part: 'Part 4',
            title: '평가 시험 안내 및 Q&A',
            duration: '15분',
            desc: '시험 형식, 평가 기준, 주의사항 안내. 질의응답.',
          },
        ].map((part) => (
          <div
            key={part.part}
            className="flex gap-05 bg-layer-01 border border-border-subtle-01 p-05 -mt-px first:mt-0"
          >
            <div className="flex-shrink-0 text-right w-16">
              <div className="cds-label-01 text-text-secondary">{part.part}</div>
              <div className="cds-helper-01 text-text-secondary mt-01">{part.duration}</div>
            </div>
            <div className="border-l border-border-subtle-01 pl-05 flex-1 min-w-0">
              <div className="cds-heading-compact-01 text-text-primary mb-01">{part.title}</div>
              <p className="cds-body-01 text-text-secondary">{part.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <Notification kind="info" title="강의는 평가 당일 진행됩니다.">
        별도 사전 준비 없이 참석하면 됩니다. 노트북과 인터넷 접속 환경을 준비하세요.
      </Notification>

      <div className="mt-09 border-t border-border-subtle-01 pt-07">
        <div className="flex flex-wrap gap-04">
          <Button kind="primary" icon="arrow-right" asChild>
            <Link href="/how-it-works">진행 방식 보기</Link>
          </Button>
          <Button kind="ghost" asChild>
            <Link href="/sample-report">샘플 리포트 보기</Link>
          </Button>
        </div>
      </div>
    </MarketingContainer>
  );
}
