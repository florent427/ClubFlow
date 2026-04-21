import type { Metadata } from 'next';
import { VitrinePageShell } from '@/components/VitrinePageShell';
import { buildPageMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    pageSlug: 'galerie',
    fallbackTitle: 'Galerie',
    fallbackDescription: "Photos de cours, compétitions et événements.",
  });
}

export default function GaleriePage() {
  return <VitrinePageShell slug="galerie" include={{ galleryPhotos: true }} />;
}
