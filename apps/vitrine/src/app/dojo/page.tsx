import type { Metadata } from 'next';
import { VitrinePageShell } from '@/components/VitrinePageShell';
import { buildPageMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    pageSlug: 'dojo',
    fallbackTitle: 'Dojo',
    fallbackDescription: "Lieu de pratique et étiquette du dojo.",
  });
}

export default function DojoPage() {
  return <VitrinePageShell slug="dojo" />;
}
