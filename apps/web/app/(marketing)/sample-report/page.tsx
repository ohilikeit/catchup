import { ReportDoc } from './ReportDoc';

// 샘플 리포트 = 외부 AI-TEST 평가 시스템이 생성하는 리포트의 예시(정적 재현).
// 평가 모듈은 이 사이트 밖(docs/1 §8) — 여기선 결과 문서의 모양만 보여준다. "HTML→PDF" 형태.
export default function SampleReportPage() {
  return <ReportDoc />;
}
