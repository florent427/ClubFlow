import type { Metadata } from 'next';
import { VitrinePageShell } from '@/components/VitrinePageShell';
import { buildPageMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    pageSlug: 'competitions',
    fallbackTitle: 'Compétitions',
    fallbackDescription: 'Résultats, palmarès et champions du club.',
  });
}

export default function CompetitionsPage() {
  return <VitrinePageShell slug="competitions" />;
}
