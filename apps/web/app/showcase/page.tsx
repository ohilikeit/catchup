import type { Metadata } from 'next';
import { SiteHeader } from '../_components/SiteHeader';
import { Gallery } from '../_components/Gallery';

export const metadata: Metadata = { title: '디자인 시스템' };

// 디자인 시스템 쇼케이스(원래 루트였음). 마케팅 랜딩이 "/"를 차지하므로 /showcase로 이전.
export default function ShowcasePage() {
  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <Gallery />
    </div>
  );
}
