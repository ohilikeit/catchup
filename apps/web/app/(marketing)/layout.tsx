import { MarketingHeader } from './_components/MarketingHeader';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <MarketingHeader />
      <main className="flex-1">{children}</main>
    </div>
  );
}
