import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';
import { headers } from 'next/headers';
import { resolveCurrentClub } from '@/lib/club-resolution';
import { fetchArticle, fetchArticleComments } from '@/lib/page-fetchers';
import { PageHero } from '@/blocks/PageHero';
import { JsonLd, buildArticleLd, buildFaqLd } from '@/components/JsonLd';
import { ArticleComments } from '@/components/ArticleComments';
import { PptxHandlersBoundary } from '@/components/PptxHandlers';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: RouteParams): Promise<Metadata> {
  const { slug } = await params;
  const club = await resolveCurrentClub();
  const article = await fetchArticle(club.slug, slug);
  if (!article) return { title: 'Actualité introuvable' };
  const title = article.seoTitle || article.title;
  const description = article.seoDescription || article.excerpt || undefined;
  const ogImage = article.seoOgImageUrl || article.coverImageUrl;
  return {
    title,
    description,
    keywords: article.seoKeywords?.length ? article.seoKeywords : undefined,
    alternates: article.seoCanonicalUrl
      ? { canonical: article.seoCanonicalUrl }
      : undefined,
    robots: article.seoNoindex
      ? { index: false, follow: false }
      : undefined,
    openGraph: {
      title,
      description,
      images: ogImage
        ? [
            {
              url: ogImage,
              alt: article.coverImageAlt ?? article.title,
            },
          ]
        : undefined,
      type: 'article',
      publishedTime: article.publishedAt ?? undefined,
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
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
 * Rendu du body JSON. Même logique que /blog/[slug] — actualités et blog
 * partagent la même structure (VitrineArticle). Le fichier est dupliqué
 * pour isoler la configuration du canal (back-link, breadcrumb, URL
 * canonique JSON-LD).
 */
function renderBody(bodyJson: string): ReactElement {
  try {
    const parsed = JSON.parse(bodyJson) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      (parsed as Record<string, unknown>).format === 'html' &&
      typeof (parsed as Record<string, unknown>).html === 'string'
    ) {
      const html = (parsed as { html: string }).html;
      return (
        <div
          className="article-prose"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    }
    if (Array.isArray(parsed)) {
      return (
        <>
          {(parsed as string[]).map((raw, i) => {
            const t = raw.trim();
            if (t.startsWith('## ')) {
              return (
                <h2 key={i} style={{ marginTop: '1.8em' }}>
                  {t.slice(3)}
                </h2>
              );
            }
            const imgMatch = /^!\[(.*?)\]\((.+)\)$/.exec(t);
            if (imgMatch) {
              return (
                <p key={i}>
                  <img
                    src={imgMatch[2]}
                    alt={imgMatch[1] ?? ''}
                    style={{ maxWidth: '100%' }}
                  />
                </p>
              );
            }
            return (
              <p
                key={i}
                style={{
                  fontSize: 17,
                  color: 'var(--muted)',
                  lineHeight: 1.85,
                  marginBottom: '1.25em',
                }}
              >
                {t}
              </p>
            );
          })}
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

export default async function ActualiteDetailPage({ params }: RouteParams) {
  const { slug } = await params;
  const club = await resolveCurrentClub();
  const article = await fetchArticle(club.slug, slug);
  if (!article) notFound();
  const comments = await fetchArticleComments(club.slug, slug);

  const hdrs = await headers();
  const host = hdrs.get('host') ?? 'localhost:5175';
  const proto =
    process.env.NODE_ENV === 'production'
      ? 'https'
      : (hdrs.get('x-forwarded-proto') ?? 'http');
  const articleLd = buildArticleLd({
    title: article.seoTitle || article.title,
    description: article.seoDescription || article.excerpt,
    url: `${proto}://${host}/actualites/${article.slug}`,
    publishedAt: article.publishedAt,
    coverImageUrl: article.seoOgImageUrl || article.coverImageUrl,
    clubName: club.name,
    keywords: article.seoKeywords,
  });
  const faqLd =
    article.seoFaq && article.seoFaq.length > 0
      ? buildFaqLd(article.seoFaq)
      : null;

  return (
    <article>
      <JsonLd data={articleLd} />
      {faqLd ? <JsonLd data={faqLd} /> : null}
      <PageHero
        label={formatDate(article.publishedAt)}
        kanji="報"
        title={article.title}
        subtitle={article.excerpt ?? undefined}
      />
      {article.categories && article.categories.length > 0 ? (
        <div className="container" style={{ marginTop: 24 }}>
          <div className="article-categories">
            {article.categories.map((c) => (
              <Link
                key={c.id}
                href={`/actualites/categorie/${c.slug}`}
                className="article-category-chip"
                style={
                  c.color
                    ? {
                        background: `${c.color}20`,
                        color: c.color,
                        borderColor: `${c.color}55`,
                      }
                    : undefined
                }
              >
                {c.name}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {article.coverImageUrl ? (
        <div
          className="container"
          style={{ marginTop: 40, marginBottom: 40 }}
        >
          <figure className="article-cover">
            <img
              src={article.coverImageUrl}
              alt={article.coverImageAlt ?? article.title}
            />
            {article.coverImageAlt ? (
              <figcaption>{article.coverImageAlt}</figcaption>
            ) : null}
          </figure>
        </div>
      ) : null}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container article-container">
          <PptxHandlersBoundary>{renderBody(article.bodyJson)}</PptxHandlersBoundary>

          {article.seoFaq && article.seoFaq.length > 0 ? (
            <aside className="article-faq">
              <h2>Questions fréquentes</h2>
              <dl>
                {article.seoFaq.map((qa, i) => (
                  <div key={i} className="article-faq__item">
                    <dt>{qa.question}</dt>
                    <dd>{qa.answer}</dd>
                  </div>
                ))}
              </dl>
            </aside>
          ) : null}

          <ArticleComments
            clubSlug={club.slug}
            articleSlug={article.slug}
            apiUrl={process.env.VITRINE_API_URL ?? 'http://localhost:3000/graphql'}
            initialComments={comments}
          />

          <nav className="article-back">
            <a href="/actualites" className="article-back__link">
              ← Retour aux actualités
            </a>
          </nav>
        </div>
      </section>
    </article>
  );
}
