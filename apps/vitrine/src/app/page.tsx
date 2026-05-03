import type { Metadata } from 'next';
import { VitrinePageShell } from '@/components/VitrinePageShell';
import { buildPageMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    pageSlug: 'index',
    fallbackTitle: 'Accueil',
    fallbackDescription:
      "L'école de karaté traditionnel Shotokan du sud de La Réunion.",
  });
}

export default function HomePage() {
  return (
    <VitrinePageShell
      slug="index"
      include={{ articles: true, announcements: true }}
    />
  );
}
