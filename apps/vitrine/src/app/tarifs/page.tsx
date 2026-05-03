import type { Metadata } from 'next';
import { VitrinePageShell } from '@/components/VitrinePageShell';
import { buildPageMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    pageSlug: 'tarifs',
    fallbackTitle: 'Tarifs',
    fallbackDescription: "Cotisations et formules d'adhésion.",
  });
}

export default function TarifsPage() {
  return <VitrinePageShell slug="tarifs" />;
}
