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
    pageSlug: 'tarifs',
    fallbackTitle: 'Tarifs',
    fallbackDescription: "Cotisations et formules d'adhésion.",
  });
}

export default async function TarifsPage({ params }: RouteParams) {
  const { host, editFlag } = await params;
  return <VitrinePageShell host={host} editFlag={editFlag} slug="tarifs" />;
}
