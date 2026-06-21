// (exam) 셸 = 시험 런타임 풀스크린 래퍼. 영속 대시보드 셸 없음(docs/1 §1: "풀스크린·셸 없음").
// 배경만 깔고 children을 그대로 — 각 페이지가 자기 레이아웃을 책임진다.

export default function ExamLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-background">{children}</div>;
}
