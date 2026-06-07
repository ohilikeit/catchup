import { SiteHeader } from '../_components/SiteHeader';
import { Gallery } from '../_components/Gallery';

// 디자인 시스템 쇼케이스(원래 루트였음). 마케팅 랜딩이 "/"를 차지하므로 /showcase로 이전.
export default function ShowcasePage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <Gallery />
    </div>
  );
}
