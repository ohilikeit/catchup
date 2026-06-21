import type { Metadata } from 'next';
import { ReportDoc } from './ReportDoc';

export const metadata: Metadata = {
  title: '샘플 리포트',
  description: 'AI 협업 과정과 코드 결과를 종합 평가한 리포트 예시 — 점수·해석·발전 방향·통계 비교.',
};

// 샘플 리포트 = 외부 AI-TEST 평가 시스템이 생성하는 리포트의 예시(정적 재현).
// 평가 모듈은 이 사이트 밖(docs/1 §8) — 여기선 결과 문서의 모양만 보여준다. "HTML→PDF" 형태.
export default function SampleReportPage() {
  return <ReportDoc />;
}
