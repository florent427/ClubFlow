import type { Metadata } from 'next';
import { VitrinePageShell } from '@/components/VitrinePageShell';
import { buildPageMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    pageSlug: 'actualites',
    fallbackTitle: 'Actualités',
    fallbackDescription: 'Articles et annonces récentes du club.',
  });
}

export default function ActualitesPage() {
  return <VitrinePageShell slug="actualites" include={{ articles: true }} />;
}
