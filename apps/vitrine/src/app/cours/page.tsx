import type { Metadata } from 'next';
import { VitrinePageShell } from '@/components/VitrinePageShell';
import { buildPageMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    pageSlug: 'cours',
    fallbackTitle: 'Cours',
    fallbackDescription: 'Planning hebdomadaire et disciplines enseignées.',
  });
}

export default function CoursPage() {
  return <VitrinePageShell slug="cours" />;
}
