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
    pageSlug: 'index',
    fallbackTitle: 'Accueil',
    fallbackDescription: 'Le site officiel du club.',
  });
}

export default async function HomePage({ params }: RouteParams) {
  const { host, editFlag } = await params;
  return (
    <VitrinePageShell
      host={host}
      editFlag={editFlag}
      slug="index"
      include={{ articles: true, announcements: true }}
    />
  );
}
