import type { Metadata } from 'next';
import { VitrinePageShell } from '@/components/VitrinePageShell';
import { buildPageMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    pageSlug: 'equipe',
    fallbackTitle: 'Équipe',
    fallbackDescription: 'Senseis, bureau et équipe encadrante.',
  });
}

export default function EquipePage() {
  return <VitrinePageShell slug="equipe" />;
}
