import { SiteHeader } from './_components/SiteHeader';
import { Gallery } from './_components/Gallery';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <Gallery />
    </div>
  );
}
