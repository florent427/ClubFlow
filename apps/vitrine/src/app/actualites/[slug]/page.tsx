import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';
import { headers } from 'next/headers';
import { resolveCurrentClub } from '@/lib/club-resolution';
import { fetchArticle } from '@/lib/page-fetchers';
import { PageHero } from '@/blocks/PageHero';
import { JsonLd, buildArticleLd } from '@/components/JsonLd';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata(
  { params }: RouteParams,
): Promise<Metadata> {
  const { slug } = await params;
  const club = await resolveCurrentClub();
  const article = await fetchArticle(club.slug, slug);
  if (!article) return { title: 'Article introuvable' };
  return {
    title: article.title,
    description: article.excerpt ?? undefined,
    openGraph: {
      title: article.title,
      description: article.excerpt ?? undefined,
      images: article.coverImageUrl
        ? [{ url: article.coverImageUrl }]
        : undefined,
      type: 'article',
      publishedTime: article.publishedAt ?? undefined,
    },
  };
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Rendu simple du body JSON — on suppose un tableau de paragraphes ou un objet
 * Tiptap. Phase 1 : rendu naïf (paragraphes). Phase 2 : rendu Tiptap complet.
 */
function renderBody(bodyJson: string): ReactElement {
  try {
    const parsed = JSON.parse(bodyJson) as unknown;
    if (Array.isArray(parsed)) {
      return (
        <>
          {(parsed as string[]).map((p, i) => (
            <p
              key={i}
              style={{
                fontSize: 17,
                color: 'var(--muted)',
                lineHeight: 1.85,
                marginBottom: '1.25em',
              }}
            >
              {p}
            </p>
          ))}
        </>
      );
    }
    return <pre>{JSON.stringify(parsed, null, 2)}</pre>;
  } catch {
    return (
      <p style={{ color: 'var(--muted)' }}>
        Le contenu de cet article n’a pas pu être affiché.
      </p>
    );
  }
}

export default async function ArticlePage({ params }: RouteParams) {
  const { slug } = await params;
  const club = await resolveCurrentClub();
  const article = await fetchArticle(club.slug, slug);
  if (!article) notFound();

  const hdrs = await headers();
  const host = hdrs.get('host') ?? 'localhost:5175';
  const proto =
    process.env.NODE_ENV === 'production'
      ? 'https'
      : hdrs.get('x-forwarded-proto') ?? 'http';
  const articleLd = buildArticleLd({
    title: article.title,
    description: article.excerpt,
    url: `${proto}://${host}/actualites/${article.slug}`,
    publishedAt: article.publishedAt,
    coverImageUrl: article.coverImageUrl,
    clubName: club.name,
  });

  return (
    <article>
      <JsonLd data={articleLd} />
      <PageHero
        label={formatDate(article.publishedAt)}
        kanji="新"
        title={article.title}
        subtitle={article.excerpt ?? undefined}
      />
      {article.coverImageUrl ? (
        <div
          className="container"
          style={{ marginTop: 40, marginBottom: 40 }}
        >
          <img
            src={article.coverImageUrl}
            alt=""
            style={{
              width: '100%',
              maxHeight: 520,
              objectFit: 'cover',
              border: '1px solid var(--line)',
            }}
          />
        </div>
      ) : null}
      <section className="section">
        <div className="container" style={{ maxWidth: 780 }}>
          {renderBody(article.bodyJson)}
        </div>
      </section>
    </article>
  );
}
