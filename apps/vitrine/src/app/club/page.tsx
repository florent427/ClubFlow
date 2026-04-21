import type { Metadata } from 'next';
import { VitrinePageShell } from '@/components/VitrinePageShell';
import { buildPageMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    pageSlug: 'club',
    fallbackTitle: 'Le Club',
    fallbackDescription: "Histoire, valeurs et identité du club.",
  });
}

export default function ClubPage() {
  return <VitrinePageShell slug="club" />;
}
