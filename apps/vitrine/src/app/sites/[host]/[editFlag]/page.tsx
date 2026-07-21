import type { Metadata } from 'next';
import { VitrinePageShell } from '@/components/VitrinePageShell';
import { buildPageMetadata } from '@/lib/seo';

interface RouteParams {
  params: Promise<{ host: string; editFlag: string }>;
}

// Sans generateStaticParams, ce segment reste 100% dynamique (aucun cache)
// même sans headers()/cookies() — cf. pitfall vitrine lente. Un tableau
// vide suffit à activer le fallback "rendu au 1er hit, mis en cache par
// combinaison (host, editFlag) ensuite".
export async function generateStaticParams() {
  return [];
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
