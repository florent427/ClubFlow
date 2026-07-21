import type { Metadata } from 'next';
import { VitrinePageShell } from '@/components/VitrinePageShell';
import { buildPageMetadata } from '@/lib/seo';

interface RouteParams {
  params: Promise<{ host: string; editFlag: string }>;
}

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: RouteParams): Promise<Metadata> {
  const { host } = await params;
  return buildPageMetadata({
    host,
    pageSlug: 'competitions',
    fallbackTitle: 'Compétitions',
    fallbackDescription: 'Résultats, palmarès et champions du club.',
  });
}

export default async function CompetitionsPage({ params }: RouteParams) {
  const { host, editFlag } = await params;
  return (
    <VitrinePageShell host={host} editFlag={editFlag} slug="competitions" />
  );
}
