import type { Metadata } from 'next';
import { VitrinePageShell } from '@/components/VitrinePageShell';
import { buildPageMetadata } from '@/lib/seo';

interface RouteParams {
  params: Promise<{ host: string; editFlag: string }>;
}

export async function generateMetadata({
  params,
}: RouteParams): Promise<Metadata> {
  const { host } = await params;
  return buildPageMetadata({
    host,
    pageSlug: 'club',
    fallbackTitle: 'Le Club',
    fallbackDescription: "Histoire, valeurs et identité du club.",
  });
}

export default async function ClubPage({ params }: RouteParams) {
  const { host, editFlag } = await params;
  return <VitrinePageShell host={host} editFlag={editFlag} slug="club" />;
}
