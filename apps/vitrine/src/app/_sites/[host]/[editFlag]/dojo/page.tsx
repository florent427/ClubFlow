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
    pageSlug: 'dojo',
    fallbackTitle: 'Dojo',
    fallbackDescription: "Lieu de pratique et étiquette du dojo.",
  });
}

export default async function DojoPage({ params }: RouteParams) {
  const { host, editFlag } = await params;
  return <VitrinePageShell host={host} editFlag={editFlag} slug="dojo" />;
}
