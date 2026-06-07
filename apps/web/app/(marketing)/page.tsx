import Link from 'next/link';
import { Button, Icon } from '@app/ui';
import { MarketingContainer } from './_components/MarketingContainer';

// 랜딩 — 정체성: "챗봇이 아니라 실무 코딩 에이전트(Claude Code·Codex 등)를 그대로 허용하는, 자유도 높은 AI 활용 역량 평가".
// 톤: 희소성("드물다")이 아니라 성장+증명("기르고 증명한다") — 대상(대학생·취준생)에 맞춘 동기.
// 관점 둘: 응시자(실무 활용 역량을 기르고 증명) + 운영 기관(역량을 끌어올리고 대시보드로 관리).
// 가치 중심·비개발자 눈높이. 특정 고객(대학) 종속·내부 용어 미노출.

const ALLOWED_TOOLS = ['Claude Code', 'Codex', 'Cursor', 'Gemini CLI'];

/* 히어로 우측 제품 미리보기 — 실제 리포트(과정50+결과50)를 압축한 카드. /sample-report로 연결. */
function ReportPreview() {
  const rows = [
    { label: 'AI와 일하는 과정', value: 40, max: 50, pct: 80 },
    { label: '실제 만들어낸 결과물', value: 48, max: 50, pct: 95 },
  ];
  return (
    <Link href="/sample-report" className="block no-underline group">
      <div className="bg-layer-02 border border-border-subtle-01 p-06">
        <div className="flex items-start justify-between">
          <div>
            <div className="cds-label-01 text-text-secondary">평가 리포트</div>
            <div className="cds-heading-03 text-text-primary mt-01">AI 활용 역량</div>
          </div>
          <span className="cds-helper-01 text-text-secondary border border-border-subtle-01 rounded-pill px-03 py-[2px]">예시</span>
        </div>
        <div className="mt-05 flex items-end gap-02">
          <span className="text-[2.5rem] leading-none font-light text-text-primary">87.77</span>
          <span className="cds-body-01 text-text-secondary mb-[4px]">/ 100점</span>
        </div>
        <div className="mt-05 flex flex-col gap-04">
          {rows.map((r) => (
            <div key={r.label}>
              <div className="flex justify-between cds-label-01 mb-01">
                <span className="text-text-primary">{r.label}</span>
                <span className="text-text-secondary">{r.value} / {r.max}</span>
              </div>
              <div className="h-1.5 bg-border-subtle-01 rounded-sm overflow-hidden">
                <span className="block h-full bg-interactive rounded-sm" style={{ width: `${r.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-05 pt-04 border-t border-border-subtle-01 flex items-center justify-between cds-body-01 text-link-primary">
          <span>샘플 리포트 전체 보기</span>
          <Icon name="arrow-right" size={16} />
        </div>
      </div>
    </Link>
  );
}

export default function LandingPage() {
  return (
    <div className="flex flex-col">
      {/* Hero — 에이전트 자유도 캐치프라이즈 + 허용 도구 + 제품 미리보기 */}
      <section className="bg-layer-01 border-b border-border-subtle-01 py-13">
        <MarketingContainer>
          <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-09 items-center">
            <div>
              <p className="cds-label-01 text-text-secondary mb-04 uppercase tracking-widest">
                실무형 AI 활용 역량 평가
              </p>
              <h1 className="cds-heading-07 text-text-primary">
                AI를 쓰는 것과<br />
                <b className="font-semibold">AI로 일하는 것</b>은 다릅니다.
              </h1>
              <p className="cds-body-02 text-text-secondary mt-05 max-w-[480px]">
                <b className="text-text-primary">Claude Code·Codex 같은 실무 코딩 에이전트</b>를 직접 다루며
                실무에서 통하는 활용 역량을 기르고, AI와 일한 과정과 결과로 객관적으로 증명하세요.
              </p>
              {/* 허용 도구 칩 — 자유도의 시각적 증거 */}
              <div className="mt-05 flex flex-wrap items-center gap-02">
                <span className="cds-label-01 text-text-secondary mr-01">시험에서 허용:</span>
                {ALLOWED_TOOLS.map((t) => (
                  <span key={t} className="cds-helper-01 text-text-primary bg-layer-02 border border-border-subtle-01 rounded-pill px-03 py-[2px]">
                    {t}
                  </span>
                ))}
                <span className="cds-helper-01 text-text-secondary">등</span>
              </div>
              <div className="flex flex-wrap gap-04 mt-07">
                <Button kind="primary" icon="arrow-right" asChild>
                  <Link href="/how-it-works">진행 방식 보기</Link>
                </Button>
                <Button kind="tertiary" asChild>
                  <Link href="/sample-report">샘플 리포트 보기</Link>
                </Button>
              </div>
            </div>
            <ReportPreview />
          </div>
        </MarketingContainer>
      </section>

      {/* 차별점 — 챗봇/샌드박스가 아니라 실무 도구 그대로(자유도) */}
      <section className="bg-background border-b border-border-subtle-01 py-11">
        <MarketingContainer>
          <h2 className="cds-heading-05 text-text-primary mb-02">챗봇 테스트가 아닙니다</h2>
          <p className="cds-body-01 text-text-secondary mb-07 max-w-[620px]">
            정해진 보기를 고르거나 제약된 샌드박스에서 코딩하는 시험이 아닙니다.
            실무에서 실제로 쓰는 도구를 그대로 허용합니다. 높은 자유도가 진짜 실력을 드러냅니다.
          </p>
          <div className="grid md:grid-cols-3 gap-05">
            {[
              { icon: 'launch' as const, t: '상용 코딩 에이전트 허용', d: 'Claude Code·Codex 같은 실무 에이전트를 시험에서 그대로 사용합니다. 장난감 환경이 아닙니다.' },
              { icon: 'settings' as const, t: '높은 자유도', d: '도구와 접근 방식을 스스로 선택합니다. 정해진 답이 아니라 문제를 푸는 과정을 봅니다.' },
              { icon: 'document' as const, t: '실무형 과제', d: '실제 업무를 본뜬 과제로, 배운 AI 활용법을 곧바로 적용해 결과를 만듭니다.' },
            ].map((v) => (
              <div key={v.t} className="bg-layer-01 border border-border-subtle-01 p-06">
                <span className="text-icon-primary mb-04 block"><Icon name={v.icon} size={24} /></span>
                <div className="cds-heading-compact-02 text-text-primary mb-02">{v.t}</div>
                <p className="cds-body-01 text-text-secondary">{v.d}</p>
              </div>
            ))}
          </div>
        </MarketingContainer>
      </section>

      {/* 두 가지를 함께 봅니다 — 과정과 결과 */}
      <section className="py-11 bg-background">
        <MarketingContainer>
          <h2 className="cds-heading-05 text-text-primary mb-02">두 가지를 함께 봅니다</h2>
          <p className="cds-body-01 text-text-secondary mb-07">
            결과만 보면 누가 AI와 잘 협업했는지 알 수 없습니다. 과정과 결과를 같이 평가합니다.
          </p>
          <div className="grid md:grid-cols-2 gap-05">
            <div className="bg-layer-01 border border-border-subtle-01 p-06">
              <div className="flex items-center gap-03 mb-04">
                <span className="text-icon-primary"><Icon name="chat" size={24} /></span>
                <span className="cds-heading-compact-02 text-text-primary">AI와 일하는 과정</span>
              </div>
              <p className="cds-body-01 text-text-secondary">
                에이전트에게 무엇을 어떻게 시키고, 답을 어떻게 검증하며 더 나은 결과를 끌어냈는지를 봅니다.
                좋은 협업은 답을 받는 게 아니라 이끌어내는 것입니다.
              </p>
            </div>
            <div className="bg-layer-01 border border-border-subtle-01 p-06">
              <div className="flex items-center gap-03 mb-04">
                <span className="text-icon-primary"><Icon name="document" size={24} /></span>
                <span className="cds-heading-compact-02 text-text-primary">실제 만들어낸 결과물</span>
              </div>
              <p className="cds-body-01 text-text-secondary">
                완성도·정확성·실용성을 정해진 기준으로 채점합니다. 화려한 말이 아니라
                실제로 동작하고 쓸 수 있는 결과인지가 핵심입니다.
              </p>
            </div>
          </div>
        </MarketingContainer>
      </section>

      {/* 누구에게 좋은가 — 응시자 / 운영 기관(대시보드 어필) */}
      <section className="py-11 bg-layer-01 border-t border-border-subtle-01">
        <MarketingContainer>
          <h2 className="cds-heading-05 text-text-primary mb-02">누구에게 좋은가</h2>
          <p className="cds-body-01 text-text-secondary mb-07">배우는 사람과, 키우는 기관 모두에게.</p>
          <div className="grid md:grid-cols-2 gap-05">
            {/* 응시자 */}
            <div className="bg-layer-02 border border-border-subtle-01 p-06">
              <div className="flex items-center gap-03 mb-04">
                <span className="text-icon-primary"><Icon name="user" size={24} /></span>
                <span className="cds-heading-compact-02 text-text-primary">응시자</span>
              </div>
              <p className="cds-body-01 text-text-primary mb-04">진짜 AI 활용법을 배우고, 객관적으로 증명합니다.</p>
              <ul className="flex flex-col gap-03">
                {[
                  '실무에서 쓰는 AI 에이전트를 직접 다루며, 진짜 활용 역량이 무엇인지 익힙니다.',
                  '과정·결과 기반 리포트로 내 강점을 객관적으로 증명해, 취업 시장에서의 경쟁력을 확보합니다.',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-03 cds-body-01 text-text-secondary">
                    <span className="text-icon-secondary mt-[3px] flex-[0_0_auto]"><Icon name="checkmark-filled" size={16} /></span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
            {/* 운영 기관 */}
            <div className="bg-layer-02 border border-border-subtle-01 p-06">
              <div className="flex items-center gap-03 mb-04">
                <span className="text-icon-primary"><Icon name="dashboard" size={24} /></span>
                <span className="cds-heading-compact-02 text-text-primary">운영 기관</span>
              </div>
              <p className="cds-body-01 text-text-primary mb-04">구성원의 AI 역량을 끌어올리고, 한눈에 관리합니다.</p>
              <ul className="flex flex-col gap-03">
                {[
                  '단순 교육을 넘어 실무형 평가로 구성원의 AI 역량을 실제로 끌어올립니다.',
                  '더 넓은 기회와 함께, 취업 시장에서의 경쟁력을 갖춰 내보낼 수 있습니다.',
                  '대시보드로 응시 현황·제출·역량을 한눈에 관리합니다.',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-03 cds-body-01 text-text-secondary">
                    <span className="text-icon-secondary mt-[3px] flex-[0_0_auto]"><Icon name="checkmark-filled" size={16} /></span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </MarketingContainer>
      </section>

      {/* 어떻게 진행되나요 — 3단계 */}
      <section className="py-11 bg-background border-t border-border-subtle-01">
        <MarketingContainer>
          <h2 className="cds-heading-05 text-text-primary mb-02">어떻게 진행되나요</h2>
          <p className="cds-body-01 text-text-secondary mb-07">준비물 없이 당일에 끝납니다.</p>
          <div className="grid md:grid-cols-3 gap-05">
            {[
              { n: '01', icon: 'view' as const, t: '사전 강의 듣기', d: 'AI 에이전트를 실무에 활용하는 법을 배웁니다. 코딩 경험은 필요 없습니다.' },
              { n: '02', icon: 'chat' as const, t: '에이전트로 과제 풀기', d: '허용된 코딩 에이전트로 직무 과제를 해결합니다. 대화와 결과물이 자동 기록됩니다.' },
              { n: '03', icon: 'document' as const, t: '리포트 받기', d: '과정과 결과를 평가한 리포트를 받습니다. 점수와 함께 이유·피드백이 담깁니다.' },
            ].map((s) => (
              <div key={s.n} className="bg-layer-02 border border-border-subtle-01 p-06">
                <div className="flex items-center justify-between mb-04">
                  <span className="font-mono text-sm font-semibold text-text-secondary">{s.n}</span>
                  <span className="text-icon-secondary"><Icon name={s.icon} size={20} /></span>
                </div>
                <div className="cds-heading-compact-01 text-text-primary mb-02">{s.t}</div>
                <p className="cds-body-01 text-text-secondary">{s.d}</p>
              </div>
            ))}
          </div>
        </MarketingContainer>
      </section>

      {/* 마무리 CTA */}
      <section className="py-11 bg-layer-01 border-t border-border-subtle-01">
        <MarketingContainer>
          <div className="max-w-[600px]">
            <h2 className="cds-heading-04 text-text-primary mb-03">
              AI를 정말 잘 쓰는지, 숫자로 확인하세요.
            </h2>
            <p className="cds-body-01 text-text-secondary mb-06">
              응시자도, 운영 기관도 — 계정으로 로그인하면 시험·리포트와 관리 화면으로 이동합니다.
            </p>
            <div className="flex flex-wrap gap-04">
              <Button kind="primary" icon="arrow-right" asChild>
                <Link href="/login">로그인</Link>
              </Button>
              <Button kind="tertiary" asChild>
                <Link href="/how-it-works">진행 방식 보기</Link>
              </Button>
            </div>
          </div>
        </MarketingContainer>
      </section>
    </div>
  );
}
