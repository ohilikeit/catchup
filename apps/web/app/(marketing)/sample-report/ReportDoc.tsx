'use client';

// 외부 AI-TEST 평가 시스템이 생성하는 리포트의 예시(정적 재현).
// ⚠️ 평가 모듈은 이 사이트 밖(docs/1 §8). 이 화면은 "HTML로 생성 → PDF로 제공"되는 외부 리포트의 예시일 뿐이며,
//    내용/디자인은 report_예시.pdf를 충실히 재현한 정적 더미다(실 응시자 데이터 아님).
// 자체 스코프 스타일(.rp-*)을 쓴다 — 앱 Carbon 크롬이 아니라 외부 문서 룩(마룬/오렌지)을 그대로 보여주기 위함.

const CATEGORIES = [
  {
    no: 1,
    title: '전략적 질문 및 문제 정의',
    desc: 'AI와의 협업에서 문제의 본질을 파악하고, 명확한 목표를 설정하며, 제약 조건을 탐색하는 능력',
    score: 7.4,
    avg: 5.97,
    interpret:
      '지원자님은 표면적인 고객 문의를 넘어 문제의 근본 원인을 비즈니스 임팩트와 사용자 시나리오 관점에서 다층적으로 분석하고 구조화하는 데 매우 탁월한 역량을 보여주셨습니다. 특히 "문의 5건이 이런 근본 원인으로 수렴돼"라고 언급하시며 우선순위와 문제 해결 범위를 명확히 설정하고, 시스템의 암묵적 제약까지 고려한 체계적인 맥락 제공을 통해 AI가 핵심 과제에 집중할 수 있도록 훌륭하게 유도하셨습니다. 한편, AI와 협업할 때 불확실한 상황이나 전제 조건에 대해 AI의 검증을 능동적으로 유도하는 질문을 추가하시면 더욱 완성도 높은 결과를 얻으실 수 있습니다.',
    growth:
      '복잡한 실무 문제를 해결할 때는 본인이 세운 가설과 전제를 AI를 통해 다각도로 검증하는 습관이 매우 중요합니다. 다음 프로젝트에서는 AI에게 명확한 지시를 내리기 전에, 현재 상황에서 불확실한 요소들을 명시하고 이에 대한 검증을 먼저 요청해보세요. 예를 들어 "내가 생각한 이 근본 원인들 외에, 현재 시스템 구조나 트랜잭션 흐름 상 발생할 수 있는 다른 잠재적 이슈를 분석해줘"라고 질문해보세요.',
  },
  {
    no: 2,
    title: 'AI 협업 및 비판적 사고',
    desc: 'AI의 제안을 맹목적으로 수용하지 않고, 비판적으로 검토하며, 더 나은 대안을 탐색하는 능력',
    score: 9.46,
    avg: 7.23,
    interpret:
      '지원자님은 AI를 단순한 답변 도구가 아닌 전략적 파트너로 활용하여 개발 전 과정을 주도하는 탁월한 역량을 보여주셨습니다. 특히 기능 구현에 그치지 않고 보안 취약점 점검이나 동시성 문제 분석으로 대화를 확장하며, AI의 제안을 다각도로 비판적으로 검토하고 체계적인 품질 향상을 이끌어낸 점이 매우 인상적입니다. 복잡한 문제를 근본 원인별로 분류하고 우선순위에 따라 단계적인 테스트 루프와 개선 계획을 수립하여 AI를 이끄는 모습은 완숙한 기술 리더십을 증명합니다.',
    growth:
      '현재의 우수한 AI 협업 방식을 한 차원 더 확장하기 위해 의사결정 매트릭스를 활용한 트레이드오프 분석을 시도해보시는 것을 제안합니다. "제안해 준 두 가지 방식의 장단점을 성능, 유지보수성, 개발 비용 관점에서 의사결정 매트릭스 형태로 비교해줘"라고 요청해보세요. 추가로 대화가 길어질 때 "지금까지 논의한 핵심 제약조건을 한 문단으로 요약하고 다음 단계를 진행하자"라고 요청하면 AI의 추론 성능을 마지막까지 최상으로 유지할 수 있습니다.',
  },
  {
    no: 3,
    title: '기술적 실행 및 품질 확보',
    desc: '코드 품질, 테스트 전략, 에러 처리 등 기술적 실행력과 품질 확보 능력',
    score: 6.9,
    avg: 5.37,
    interpret:
      '지원자님은 AI와 협업할 때 단순히 코드를 짜달라고 요구하는 것을 넘어, 문제의 근본 원인을 먼저 구조화하고 복잡한 비즈니스 엣지 케이스와 스트레스 테스트 시나리오를 직접 설계하여 AI에게 검증을 지시하는 탁월한 역량을 보여주셨습니다. 특히 로직의 정합성을 선제적으로 점검하고, QA팀과 운영팀을 위한 체계적인 문서화(CHANGELOG.md)까지 AI에게 요청하며 전체 개발 생명주기를 아우르는 시야를 보여주신 점이 훌륭했습니다. 한편, 실행-검증-피드백 사이클을 더욱 촘촘하게 운영하시면 더 완성도 높은 결과를 얻으실 수 있습니다.',
    growth:
      '다음 프로젝트에서는 점진적인 검증 사이클과 성능 최적화 질문을 결합해 보세요. "이 기능을 구현하기 전에 먼저 실패하는 핵심 검증 코드를 작성하고, 이를 통과시키기 위한 코드만 단계별로 작성해줘"라고 요청하여 코드 품질을 단단하게 다져보세요. 또한 "이 데이터베이스 구조로 트래픽이 몰릴 때 발생할 수 있는 성능 병목과 인덱싱/최적화 전략을 세 가지 대안으로 제시해줘"와 같이 질문해 보세요.',
  },
  {
    no: 4,
    title: '비즈니스 가치 연계',
    desc: '기술적 결정을 비즈니스 목표 및 사용자 가치와 연결하는 능력',
    score: 8.25,
    avg: 5.35,
    interpret:
      '지원자님은 기술적 문제를 단순한 코드 오류로 접근하지 않고, 재무 리스크와 서비스 신뢰도 등 비즈니스 임팩트 관점에서 해석하는 탁월한 역량을 보여주셨습니다. 특히 "MAU 50만 전체에 포인트 오적립 → 재무 리스크가 가장 큼"과 같이 명확한 지표와 리스크를 연결하여 작업의 우선순위를 주도적으로 설정하신 점이 매우 인상적입니다. 또한 비즈니스 규칙의 변경 가능성을 선제적으로 예측하고 시스템 구조 개선 방향을 AI와 논의하며 비즈니스 로드맵을 기술에 녹여내셨습니다.',
    growth:
      '데이터 기반의 정량적 의사결정 프레임워크를 AI와의 대화에 적용해 보세요. "이 대안들의 비즈니스 임팩트(Impact)와 기술적 복잡도(Effort)를 RICE 프레임워크 기준으로 평가해서 표로 정리해 줘"라고 질문해 보세요. 또한 새로운 기능을 설계할 때 "이 기능이 배포되었을 때 가장 먼저 확인해야 할 핵심 성과 지표(KPI)는 무엇일까?"라고 질문하여 성과 측정 단계까지 AI를 전략적 파트너로 활용해 보세요.',
  },
  {
    no: 5,
    title: '학습 및 적응',
    desc: '새로운 기술과 방법론을 학습하고, 불확실성에 대응하며, 실패로부터 배우는 능력',
    score: 9.5,
    avg: 5.75,
    interpret:
      '지원자님은 주어진 과제의 요구사항을 완벽히 파악하는 것을 넘어, 실제 대규모 트래픽(MAU 50만) 환경을 가정한 깊이 있는 탐구를 주도적으로 이끌어주셨습니다. 단순한 코드 구현에 머물지 않고 SQL 인젝션 등 보안 취약점은 물론 인덱스 최적화 및 동시성 제어 같은 성능·안정성 측면까지 AI와 상세하게 논의하는 탁월한 호기심을 보여주셨습니다. 발생 가능한 불확실성을 예측하고 경계값 및 스트레스 테스트 시나리오를 직접 설계하여 리스크를 체계적으로 검증해 나가는 모습이 매우 훌륭했습니다.',
    growth:
      '현재의 뛰어난 검증 역량을 시스템 전체 아키텍처 설계 관점으로 확장해 보세요. "지금 작성한 동시성 처리 로직을 마이크로서비스 아키텍처(MSA)로 분리한다면 어떤 새로운 불확실성이 발생할까?" 또는 "락(Lock) 기반 방식 대신 비동기 메시지 큐를 활용하는 방식의 트레이드오프를 비교해 줘"와 같이 더 넓은 관점의 질문을 던져, 확장성까지 선제적으로 설계하는 아키텍처 리딩 역량을 강화해 보세요.',
  },
];

const FLAW_CARDS = [
  { name: '동시성 안정성', rate: 100, count: '3/3', desc: '여러 요청이 동시에 처리될 때 시스템이 안정적으로 동작하는지 검증' },
  { name: '리소스 정리', rate: 100, count: '7/7', desc: '에러 발생 시 시스템 리소스가 올바르게 정리되는지 검증' },
  { name: '연결 관리', rate: 78.7, count: '5.51 / 7', desc: '데이터베이스 연결이 효율적으로 관리되는지 검증' },
  { name: '데이터 무결성', rate: 100, count: '5/5', desc: '데이터 일관성이 유지되는지 검증' },
  { name: '비즈니스 로직 정합성', rate: 100, count: '5/5', desc: '핵심 비즈니스 규칙이 올바르게 적용되는지 검증' },
];

const BUNDLES = [
  { name: '승인 경계 케이스', rate: 55.6, weight: 4, got: '2.22/4', count: '5/9' },
  { name: '롤백 원자성', rate: 100, weight: 7, got: '7/7', count: '2/2' },
  { name: '스냅샷 불변성', rate: 100, weight: 5, got: '5/5', count: '3/3' },
  { name: '생명주기 일관성', rate: 100, weight: 6, got: '6/6', count: '3/3' },
  { name: '교차 뷰 일관성', rate: 100, weight: 5, got: '5/5', count: '2/2' },
  { name: '타임스탬프 직렬화', rate: 100, weight: 4, got: '4/4', count: '2/2' },
  { name: '종료 상태 정리', rate: 100, weight: 3, got: '3/3', count: '3/3' },
  { name: '초안 유효성 검증', rate: 100, weight: 4, got: '4/4', count: '7/7' },
  { name: '접근 권한 경계', rate: 100, weight: 2, got: '2/2', count: '5/5' },
];

const QUOTES_LEFT = {
  heading: '분석 우선 & 구조화된 접근',
  items: [
    { t: '단계별 승인 통제', q: '다음 단계에 따라 작업을 진행한다. 각 단계를 완료하고, 다음 단계를 진행하기 전에 나에게 승인을 받아야 해. 1단계: 문제 정의+요구사항 검증 / 2단계: 접근법 요청 / 3단계: 선택 근거 남기기 / 4단계: 테스트 전략 / 5단계: 구현 / 6단계: 구현 후 검증 / 7단계: 코드리뷰 / 8단계: 학습+회고' },
    { t: '분석 우선 + 확실성 수준 구분', q: '우선 코드 수정은 절대 하지 말고, 분석만 진행해줘. 추측을 사실처럼 쓰지 말고 ‘확정’, ‘추정’, ‘추가 확인 필요’를 구분해서 작성하라. DB 스키마 변경, 패키지 추가를 해결책으로 제안하지 마라.' },
    { t: '결함 유형 관점 재분류', q: '이 문제들을 단순 개별 버그가 아니라 ‘결함 유형’ 관점에서 재분류하세요. 1. 동시성 문제 2. 시간 경계 처리 오류 3. 보너스 계산 로직 순서 4. 데이터 정합성 5. 활동 사용자 판정 오류. 이 단계에서는 코드 수정 제안을 하지 말고 문제 구조를 먼저 명확히 정의하세요.' },
    { t: '아키텍처 스트레스 테스트', q: '정상 상황이 아니라 트래픽 급증, 락 경합, 데드락, 지연 같은 최악의 운영 시나리오에서도 이 설계가 버틸 수 있는지 비판적으로 검증하는 것입니다. 아직 코드는 작성하지 마세요.' },
  ],
};

const QUOTES_RIGHT = {
  heading: '비판적 사고 & 검증',
  items: [
    { t: '구현 계획 비판적 검토', q: '지금 작성된 구현 계획을 비판적으로 검토해보자. advisory lock 방식이 실제 환경에서 문제를 만들 가능성, 트랜잭션/락 순서에서 데드락이 발생할 가능성, hidden test에서 실패할 수 있는 edge case를 함께 설명해줘.' },
    { t: '제약조건 위반 즉시 기각', q: 'ON CONFLICT를 쓰려면 UNIQUE 제약이 있어야 하는데, 제약사항에 DB 스키마 변경 금지라고 했거든. 스키마 안 건드리고 코드 레벨에서만 해결해야 해. 수정은 한번에 다 하지 말고 버그 3개부터 먼저 잡고 테스트 돌려보자.' },
    { t: '자기주도 엣지케이스 테스트 설계', q: 'tests/public 통과만으로는 해결 완료가 아니다. [정확성] 같은 userId로 동시 2개 요청 시 하나만 성공하는지 [일관성] 총발행-총사용≈총잔액 정합성 [안정성] Diamond 등급 체크인 시 최대 250P를 안 넘는지.' },
    { t: '사이드이펙트 선제 분석', q: '이 기능을 적용했을 때 발생할 수 있는 최악의 사이드 이펙트는 뭐야? 그걸 대비하려면 어떤 검증 코드를 먼저 작성해야 할까? 너는 나의 전략적 파트너이지 결정권자가 아니야. 먼저 멋대로 해결하려 하지 마.' },
  ],
};

const MATURITY = [
  { name: '역할 부여', desc: 'AI에게 전문가 역할을 지정', a: 19.8, b: 40.0 },
  { name: '제약조건 명시', desc: '"~하지 마", "절대 금지" 등 경계 설정', a: 35.3, b: 50.9 },
  { name: '단계별 지시', desc: '번호 목록으로 순서 지정', a: 29.3, b: 50.0 },
  { name: '비판적 검토', desc: 'AI 답변에 "왜?", "다른 방법은?" 후속 질문', a: 38.8, b: 65.5 },
  { name: '검증 요청', desc: '테스트 실행, 결과 확인 요청', a: 58.6, b: 78.2 },
];

const FIRST_MSG = [
  { name: '짧은 지시형', pct: 57.3 },
  { name: '슈퍼프롬프트형', pct: 22.7 },
  { name: '분석 우선형', pct: 10.0 },
  { name: '역할 부여형', pct: 6.4 },
  { name: '구조화 목록형', pct: 3.6 },
];

// 02 분포: 예시 히스토그램(벨 형태) 막대 높이(%)
const HIST = [4, 9, 16, 28, 46, 68, 88, 100, 92, 74, 52, 33, 20, 11, 6];

function SectionNo({ n, title }: { n: string; title: string }) {
  return (
    <div className="rp-sechead">
      <span className="rp-secno">{n}</span>
      <h2>{title}</h2>
    </div>
  );
}

export function ReportDoc() {
  return (
    <div className="rp-page">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="rp-doc">
        {/* 상단 메타 + 예시 배지 */}
        <div className="rp-topmeta">
          <span className="rp-sample">예시 리포트 · 실제 응시자 데이터 아님</span>
          <button type="button" className="rp-print rp-noprint" onClick={() => window.print()}>
            PDF로 저장 / 인쇄
          </button>
        </div>

        {/* 헤더 */}
        <header className="rp-header">
          <div className="rp-header-text">
            <div className="rp-htitle">AI 역량검사 리포트</div>
            <div className="rp-hsub">AI 협업 과정과 문제 해결 능력을 종합적으로 평가합니다.</div>
          </div>
          <div className="rp-person">
            <span className="rp-avatar">윤</span>
            <div>
              <div className="rp-pname">윤OO</div>
              <div className="rp-pdept">OO대학교 통계학과</div>
            </div>
          </div>
        </header>

        {/* 01 개인 점수 */}
        <section className="rp-card">
          <SectionNo n="01" title="개인 점수" />
          <div className="rp-scores">
            <div className="rp-scorebox">
              <div className="rp-sb-label">AI 채팅 평가</div>
              <div className="rp-sb-val">40.12<span> / 50점</span></div>
            </div>
            <div className="rp-scorebox">
              <div className="rp-sb-label">코드 결과 평가</div>
              <div className="rp-sb-val">47.65<span> / 50점</span></div>
            </div>
            <div className="rp-scorebox rp-total">
              <div className="rp-sb-label">총점</div>
              <div className="rp-sb-val">87.77<span> / 100점</span></div>
            </div>
          </div>

          <table className="rp-table">
            <thead>
              <tr><th>과제 유형</th><th>AI 활용 점수</th><th>코드 결과 점수</th><th>합계</th></tr>
            </thead>
            <tbody>
              <tr><td><b className="rp-tag-f">F</b> 결함 해결 과제</td><td>20.48 / 25</td><td>23.76 / 25</td><td className="rp-strong">44.24 / 50</td></tr>
              <tr><td><b className="rp-tag-g">G</b> 생성 과제</td><td>19.64 / 25</td><td>23.89 / 25</td><td className="rp-strong">43.53 / 50</td></tr>
            </tbody>
          </table>
        </section>

        {/* 02 통계 비교 */}
        <section className="rp-card">
          <SectionNo n="02" title="통계 비교" />
          <p className="rp-muted">총 55명의 응시자 중 나의 위치를 확인해보세요.</p>
          <div className="rp-hist">
            {HIST.map((h, i) => (
              <span key={i} className="rp-bar" style={{ height: `${h}%` }} />
            ))}
            <span className="rp-marker rp-marker-target" style={{ left: '50%' }} title="목표 60점" />
            <span className="rp-marker rp-marker-me" style={{ left: '83%' }} title="나의 점수 87.77" />
          </div>
          <div className="rp-legend">
            <span><i className="rp-dot rp-dot-avg" /> 평균 76.55점</span>
            <span><i className="rp-dot rp-dot-med" /> 중앙값 76.38점</span>
            <span><i className="rp-dot rp-dot-target" /> 목표 60점</span>
            <span><i className="rp-dot rp-dot-me" /> 나의 점수 87.77점</span>
          </div>
          <p className="rp-note">
            전체 응시자의 평균은 76.55점, 중앙값은 76.38점입니다. 기대하는 역량 수준의 목표 점수는 60점이며,
            귀하의 최종 점수는 <b>87.77점</b>으로 평균 대비 약 <b>11.2점 높은</b> 수준입니다.
          </p>
        </section>

        {/* 03 AI 활용 점수 상세 분석 */}
        <section className="rp-card">
          <SectionNo n="03" title="AI 활용 점수 상세 분석" />
          {CATEGORIES.map((c) => (
            <div key={c.no} className="rp-cat">
              <div className="rp-cat-top">
                <div>
                  <div className="rp-cat-title">{c.no}. {c.title}</div>
                  <div className="rp-cat-desc">{c.desc}</div>
                </div>
                <div className="rp-cat-score">
                  {c.score}<span> / 10</span>
                  <div className="rp-cat-avg">평균 {c.avg}</div>
                </div>
              </div>
              <div className="rp-track">
                <span className="rp-avgline" style={{ left: `${c.avg * 10}%` }} />
                <span className="rp-fill" style={{ width: `${c.score * 10}%` }} />
              </div>
              <div className="rp-block">
                <span className="rp-block-tag">해석</span>
                <p>{c.interpret}</p>
              </div>
              <div className="rp-block rp-block-growth">
                <span className="rp-block-tag rp-tag-growth">발전 방향</span>
                <p>{c.growth}</p>
              </div>
            </div>
          ))}
        </section>

        {/* 04 코드 결과 점수 */}
        <section className="rp-card">
          <SectionNo n="04" title="코드 결과 점수" />
          <p className="rp-muted">제출하신 코드는 사전에 준비된 비공개 테스트 케이스로 기능 정확성·엣지 케이스·코드 품질을 자동 검증합니다.</p>

          <div className="rp-taskhead">
            <div><b className="rp-tag-f">F</b> 결함 해결 과제</div>
            <div className="rp-taskscore"><span className="rp-pct">95.0%</span> <span className="rp-pts">28.51/30</span></div>
          </div>
          <h4 className="rp-subh">결함 해결 상세</h4>
          <div className="rp-grid2">
            {FLAW_CARDS.map((f) => (
              <div key={f.name} className={`rp-tcard ${f.rate === 100 ? 'rp-pass' : 'rp-partial'}`}>
                <div className="rp-tcard-top"><span>{f.name}</span><b>{f.rate}%</b></div>
                <div className="rp-tcard-desc">{f.desc}</div>
                <div className="rp-tcard-count">{f.count}</div>
              </div>
            ))}
            <div className="rp-tcard rp-pass">
              <div className="rp-tcard-top"><span>품질 테스트</span><b>100%</b></div>
              <div className="rp-tcard-desc">코드 구조, 에러 처리, 베스트 프랙티스 준수 여부</div>
              <div className="rp-tcard-count">2/2</div>
            </div>
          </div>

          <div className="rp-taskhead rp-mt">
            <div><b className="rp-tag-g">G</b> 생성 과제</div>
            <div className="rp-taskscore"><span className="rp-pct">96%</span> <span className="rp-pts">38.22/40</span></div>
          </div>
          <h4 className="rp-subh">기능 번들별 결과</h4>
          <div className="rp-grid2">
            {BUNDLES.map((b) => (
              <div key={b.name} className={`rp-tcard ${b.rate === 100 ? 'rp-pass' : 'rp-partial'}`}>
                <div className="rp-tcard-top"><span>{b.name}</span><b>{b.rate}%</b></div>
                <div className="rp-tcard-desc">가중치: {b.weight} · 획득: {b.got}</div>
                <div className="rp-tcard-count">{b.count}</div>
              </div>
            ))}
          </div>
        </section>

        {/* 05 우수 대화 예시 */}
        <section className="rp-card">
          <SectionNo n="05" title="우수 대화 예시" />
          <p className="rp-muted">전체 참가자들 중에 발췌한 좋은 프롬프트 사례입니다.</p>
          <div className="rp-grid2 rp-quotes">
            {[QUOTES_LEFT, QUOTES_RIGHT].map((col) => (
              <div key={col.heading} className="rp-qcol">
                <h4 className="rp-qhead">{col.heading}</h4>
                {col.items.map((it) => (
                  <div key={it.t} className="rp-quote">
                    <div className="rp-quote-t">{it.t}</div>
                    <p>“{it.q}”</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        {/* 06 다른 사람들은 AI를 어떻게 쓰고 있을까? */}
        <section className="rp-card">
          <SectionNo n="06" title="다른 사람들은 AI를 어떻게 쓰고 있을까?" />
          <p className="rp-muted">1차 테스트 58명, 2차 테스트 55명의 AI 채팅 로그를 분석한 결과입니다.</p>

          <div className="rp-grid3">
            <div className="rp-statcard">
              <div className="rp-stat-label">세션당 평균 메시지 수</div>
              <div className="rp-stat-val">10.4 → 14.6개</div>
              <div className="rp-stat-delta">+40% 증가</div>
            </div>
            <div className="rp-statcard">
              <div className="rp-stat-label">평균 메시지 길이</div>
              <div className="rp-stat-val">212 → 343자</div>
              <div className="rp-stat-delta">+62% 증가</div>
            </div>
            <div className="rp-statcard">
              <div className="rp-stat-label">최장 단일 프롬프트</div>
              <div className="rp-stat-val">17,467자</div>
              <div className="rp-stat-delta rp-muted2">원고지 약 87장 분량</div>
            </div>
          </div>

          <h4 className="rp-subh">첫 메시지 전략 분포 <span className="rp-muted2">(2차 테스트 기준)</span></h4>
          <div className="rp-firstmsg">
            {FIRST_MSG.map((f) => (
              <div key={f.name} className="rp-fm-row">
                <span className="rp-fm-name">{f.name}</span>
                <span className="rp-fm-track"><span className="rp-fm-fill" style={{ width: `${f.pct}%` }} /></span>
                <span className="rp-fm-pct">{f.pct}%</span>
              </div>
            ))}
          </div>

          <h4 className="rp-subh">AI 활용 성숙도 변화 (1차 → 2차)</h4>
          <div className="rp-maturity">
            {MATURITY.map((m) => (
              <div key={m.name} className="rp-mat-row">
                <div className="rp-mat-head">
                  <span className="rp-mat-name">{m.name}</span>
                  <span className="rp-mat-desc">{m.desc}</span>
                  <span className="rp-mat-vals">{m.a}% → <b>{m.b}%</b></span>
                </div>
                <div className="rp-track rp-track-sm">
                  <span className="rp-fill rp-fill-1" style={{ width: `${m.a}%` }} />
                  <span className="rp-fill rp-fill-2" style={{ width: `${m.b}%` }} />
                </div>
              </div>
            ))}
          </div>

          <h4 className="rp-subh">프롬프트 구조화 수준 변화</h4>
          <div className="rp-grid2">
            <div className="rp-structcard">
              <div className="rp-struct-title">1차 테스트</div>
              <div className="rp-struct-row"><span>고구조화</span><span>24.1%</span></div>
              <div className="rp-struct-row"><span>반구조화</span><span>25.9%</span></div>
              <div className="rp-struct-row"><span>비구조화</span><span>50.0%</span></div>
            </div>
            <div className="rp-structcard">
              <div className="rp-struct-title">2차 테스트</div>
              <div className="rp-struct-row"><span>고구조화</span><b>45.5%</b></div>
              <div className="rp-struct-row"><span>반구조화</span><span>21.8%</span></div>
              <div className="rp-struct-row"><span>비구조화</span><span>32.7%</span></div>
            </div>
          </div>
          <p className="rp-foot-note">* 고구조화: 번호 목록 + 제약조건 + 출력 포맷 지정 중 2개 이상 활용 / 반구조화: 1개 / 비구조화: 자연어 대화체</p>
        </section>

        <footer className="rp-footer">
          <div className="rp-brand">AI-TEST</div>
          <div>본 리포트는 AI-TEST 평가 시스템에 의해 자동 생성됩니다.</div>
          <div>문의사항: aiteam01@jinhakapply.com</div>
          <div className="rp-muted2">© 2026 AI-TEST. All rights reserved.</div>
        </footer>
      </div>
    </div>
  );
}

const CSS = `
.rp-page{ --maroon:#7d1d3f; --maroon2:#9a2748; --orange:#d9591f; --green:#2f8a4e; --greenbg:#eaf6ee;
  --ink:#23201f; --muted:#6f6a68; --line:#e7e3e1; --bg:#ededec; --card:#ffffff;
  background:var(--bg); padding:32px 16px; display:flex; justify-content:center;
  font-family:'IBM Plex Sans KR','Pretendard',system-ui,sans-serif; color:var(--ink); }
.rp-doc{ width:100%; max-width:880px; display:flex; flex-direction:column; gap:16px; }
.rp-topmeta{ display:flex; justify-content:space-between; align-items:center; font-size:11px; color:var(--muted); padding:0 4px; }
.rp-sample{ background:#fff4e6; color:#b65a14; border:1px solid #f0d3ad; border-radius:999px; padding:2px 10px; font-weight:600; }
.rp-header{ background:linear-gradient(120deg,var(--maroon) 0%,var(--maroon2) 55%,var(--orange) 130%); color:#fff;
  border-radius:14px; padding:26px 28px; display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap; }
.rp-htitle{ font-size:26px; font-weight:700; letter-spacing:-0.3px; }
.rp-hsub{ font-size:13px; opacity:.88; margin-top:6px; }
.rp-person{ display:flex; align-items:center; gap:12px; }
.rp-avatar{ width:46px; height:46px; border-radius:50%; background:rgba(255,255,255,.18); border:1px solid rgba(255,255,255,.4);
  display:flex; align-items:center; justify-content:center; font-size:20px; font-weight:700; }
.rp-pname{ font-size:16px; font-weight:700; }
.rp-pdept{ font-size:12px; opacity:.85; margin-top:2px; }
.rp-card{ background:var(--card); border:1px solid var(--line); border-radius:14px; padding:24px; box-shadow:0 1px 2px rgba(0,0,0,.03); }
.rp-sechead{ display:flex; align-items:center; gap:10px; margin-bottom:16px; }
.rp-secno{ background:var(--maroon); color:#fff; font-size:12px; font-weight:700; border-radius:6px; padding:3px 8px; letter-spacing:1px; }
.rp-sechead h2{ font-size:18px; font-weight:700; margin:0; }
.rp-muted{ color:var(--muted); font-size:13px; margin:0 0 14px; }
.rp-muted2{ color:var(--muted); font-weight:400; }
.rp-scores{ display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:16px; }
.rp-scorebox{ border:1px solid var(--line); border-radius:12px; padding:18px; text-align:center; background:#faf9f8; }
.rp-scorebox.rp-total{ background:linear-gradient(135deg,var(--maroon),var(--orange)); border:none; color:#fff; }
.rp-sb-label{ font-size:12px; color:var(--muted); margin-bottom:8px; }
.rp-total .rp-sb-label{ color:rgba(255,255,255,.85); }
.rp-sb-val{ font-size:30px; font-weight:700; }
.rp-sb-val span{ font-size:14px; font-weight:500; color:var(--muted); }
.rp-total .rp-sb-val span{ color:rgba(255,255,255,.8); }
.rp-table{ width:100%; border-collapse:collapse; font-size:13px; }
.rp-table th,.rp-table td{ text-align:center; padding:11px 8px; border-bottom:1px solid var(--line); }
.rp-table th{ background:#faf9f8; color:var(--muted); font-weight:600; font-size:12px; }
.rp-table td:first-child,.rp-table th:first-child{ text-align:left; }
.rp-strong{ font-weight:700; color:var(--maroon); }
.rp-tag-f,.rp-tag-g{ display:inline-block; width:18px; height:18px; line-height:18px; text-align:center; border-radius:5px; color:#fff; font-size:11px; margin-right:6px; }
.rp-tag-f{ background:var(--maroon); } .rp-tag-g{ background:var(--orange); }
.rp-hist{ position:relative; display:flex; align-items:flex-end; gap:4px; height:130px; padding:10px 0 0; border-bottom:2px solid var(--line); margin-bottom:8px; }
.rp-bar{ flex:1; background:linear-gradient(to top,var(--maroon),#d99a7e); border-radius:3px 3px 0 0; opacity:.55; }
.rp-marker{ position:absolute; bottom:0; top:0; width:2px; }
.rp-marker-target{ background:var(--green); } .rp-marker-me{ background:var(--orange); width:3px; }
.rp-legend{ display:flex; flex-wrap:wrap; gap:14px; font-size:12px; color:var(--muted); margin-bottom:10px; }
.rp-dot{ display:inline-block; width:9px; height:9px; border-radius:50%; margin-right:5px; vertical-align:middle; }
.rp-dot-avg{ background:#b8b2af; } .rp-dot-med{ background:#8d8784; } .rp-dot-target{ background:var(--green); } .rp-dot-me{ background:var(--orange); }
.rp-note{ font-size:13px; line-height:1.7; background:#faf6f2; border-left:3px solid var(--orange); padding:12px 14px; border-radius:0 8px 8px 0; margin:0; }
.rp-cat{ padding:18px 0; border-top:1px solid var(--line); }
.rp-cat:first-of-type{ border-top:none; padding-top:4px; }
.rp-cat-top{ display:flex; justify-content:space-between; align-items:flex-start; gap:16px; }
.rp-cat-title{ font-size:15px; font-weight:700; }
.rp-cat-desc{ font-size:12px; color:var(--muted); margin-top:3px; max-width:60ch; }
.rp-cat-score{ font-size:22px; font-weight:700; color:var(--maroon); text-align:right; white-space:nowrap; }
.rp-cat-score span{ font-size:13px; color:var(--muted); font-weight:500; }
.rp-cat-avg{ font-size:11px; color:var(--muted); font-weight:500; }
.rp-track{ position:relative; height:8px; background:#efeae7; border-radius:6px; margin:10px 0 14px; overflow:hidden; }
.rp-track-sm{ height:7px; margin:6px 0 0; }
.rp-fill{ position:absolute; left:0; top:0; bottom:0; background:linear-gradient(90deg,var(--maroon),var(--orange)); border-radius:6px; }
.rp-fill-1{ background:#cdbfb9; z-index:1; }
.rp-fill-2{ background:linear-gradient(90deg,var(--maroon),var(--orange)); z-index:2; opacity:.92; }
.rp-avgline{ position:absolute; top:-2px; bottom:-2px; width:2px; background:#7a756f; z-index:3; }
.rp-block{ font-size:13px; line-height:1.7; margin-top:8px; }
.rp-block p{ margin:4px 0 0; color:#33302e; }
.rp-block-tag{ display:inline-block; font-size:11px; font-weight:700; color:var(--maroon); background:#f6ecef; border-radius:5px; padding:2px 8px; }
.rp-tag-growth{ color:var(--orange); background:#fcefe6; }
.rp-block-growth{ background:#faf9f8; border-radius:8px; padding:12px 14px; margin-top:10px; }
.rp-taskhead{ display:flex; justify-content:space-between; align-items:center; font-size:15px; font-weight:700; margin:6px 0 4px; }
.rp-taskhead.rp-mt{ margin-top:24px; padding-top:20px; border-top:1px solid var(--line); }
.rp-taskscore .rp-pct{ color:var(--green); font-size:18px; }
.rp-taskscore .rp-pts{ color:var(--muted); font-size:13px; font-weight:500; }
.rp-subh{ font-size:13px; font-weight:700; color:var(--muted); margin:14px 0 10px; }
.rp-grid2{ display:grid; grid-template-columns:repeat(2,1fr); gap:10px; }
.rp-grid3{ display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:6px; }
.rp-tcard{ border:1px solid var(--line); border-radius:10px; padding:12px 14px; }
.rp-tcard.rp-pass{ background:var(--greenbg); border-color:#cfe9d6; }
.rp-tcard.rp-partial{ background:#fff7ec; border-color:#f1ddbf; }
.rp-tcard-top{ display:flex; justify-content:space-between; font-weight:700; font-size:13px; }
.rp-tcard.rp-pass .rp-tcard-top b{ color:var(--green); }
.rp-tcard.rp-partial .rp-tcard-top b{ color:#c47d1a; }
.rp-tcard-desc{ font-size:11px; color:var(--muted); margin:4px 0 8px; line-height:1.5; }
.rp-tcard-count{ font-size:12px; font-weight:600; color:#4b4744; }
.rp-quotes .rp-qcol{ display:flex; flex-direction:column; gap:10px; }
.rp-qhead{ font-size:13px; font-weight:700; color:var(--maroon); margin:0 0 2px; }
.rp-quote{ background:#faf9f8; border:1px solid var(--line); border-left:3px solid var(--orange); border-radius:0 8px 8px 0; padding:11px 13px; }
.rp-quote-t{ font-size:12px; font-weight:700; margin-bottom:4px; }
.rp-quote p{ font-size:12px; line-height:1.65; color:#46423f; margin:0; }
.rp-statcard{ border:1px solid var(--line); border-radius:10px; padding:14px; text-align:center; background:#faf9f8; }
.rp-stat-label{ font-size:12px; color:var(--muted); }
.rp-stat-val{ font-size:20px; font-weight:700; color:var(--maroon); margin:6px 0 2px; }
.rp-stat-delta{ font-size:12px; font-weight:600; color:var(--orange); }
.rp-firstmsg{ display:flex; flex-direction:column; gap:7px; }
.rp-fm-row{ display:flex; align-items:center; gap:10px; font-size:12px; }
.rp-fm-name{ width:96px; flex:0 0 auto; color:#46423f; }
.rp-fm-track{ flex:1; height:9px; background:#efeae7; border-radius:6px; overflow:hidden; }
.rp-fm-fill{ display:block; height:100%; background:linear-gradient(90deg,var(--maroon),var(--orange)); border-radius:6px; }
.rp-fm-pct{ width:46px; text-align:right; font-weight:600; color:var(--muted); flex:0 0 auto; }
.rp-maturity{ display:flex; flex-direction:column; gap:12px; }
.rp-mat-head{ display:flex; align-items:baseline; gap:8px; font-size:12px; flex-wrap:wrap; }
.rp-mat-name{ font-weight:700; }
.rp-mat-desc{ color:var(--muted); flex:1; }
.rp-mat-vals{ font-weight:600; color:var(--maroon); }
.rp-structcard{ border:1px solid var(--line); border-radius:10px; padding:14px; }
.rp-struct-title{ font-size:13px; font-weight:700; margin-bottom:8px; }
.rp-struct-row{ display:flex; justify-content:space-between; font-size:13px; padding:5px 0; border-top:1px solid var(--line); }
.rp-struct-row b{ color:var(--maroon); }
.rp-foot-note{ font-size:11px; color:var(--muted); margin-top:10px; }
.rp-footer{ text-align:center; color:var(--muted); font-size:12px; padding:20px; display:flex; flex-direction:column; gap:3px; }
.rp-brand{ font-weight:800; letter-spacing:2px; color:var(--maroon); font-size:15px; margin-bottom:4px; }
.rp-print{ background:var(--maroon); color:#fff; border:none; border-radius:999px; padding:4px 12px; font-size:11px; font-weight:600; cursor:pointer; }
.rp-print:hover{ background:var(--maroon2); }
@media (max-width:680px){
  .rp-scores,.rp-grid2,.rp-grid3{ grid-template-columns:1fr; }
  .rp-htitle{ font-size:21px; }
}
@media print{
  .rp-page{ background:#fff; padding:0; }
  .rp-noprint{ display:none !important; }
  .rp-card{ box-shadow:none; break-inside:avoid; }
}
`;
