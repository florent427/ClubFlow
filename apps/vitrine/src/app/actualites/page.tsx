import type { Metadata } from 'next';
import Link from 'next/link';
import { resolveCurrentClub } from '@/lib/club-resolution';
import {
  fetchArticles,
  type VitrineArticleSummary,
} from '@/lib/page-fetchers';
import { PageHero } from '@/blocks/PageHero';
import { buildPageMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    pageSlug: 'actualites',
    fallbackTitle: 'Actualités',
    fallbackDescription:
      'Brèves et actualités récentes du club.',
  });
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
 * Page publique des actualités.
 *
 * Liste les articles publiés avec `channel = NEWS`. Même structure et
 * même rendu que `/blog` — seul le filtre diffère. Chaque article a sa
 * page de détail, ses catégories, ses commentaires, son SEO, etc.
 */
export default async function ActualitesPage() {
  const club = await resolveCurrentClub();
  const articles = await fetchArticles(club.slug, 50, 'NEWS');

  return (
    <article>
      <PageHero
        label="Actualités"
        kanji="報"
        title="Les dernières nouvelles"
        subtitle="Brèves, annonces et informations récentes du club."
      />

      <section className="section">
        <div className="container">
          {articles.length === 0 ? (
            <p
              className="muted"
              style={{ textAlign: 'center', padding: '48px 0' }}
            >
              Aucune actualité publiée pour le moment.
            </p>
          ) : (
            <div className="article-grid">
              {articles.map((a) => (
                <ArticleCard key={a.slug} article={a} />
              ))}
            </div>
          )}
        </div>
      </section>
    </article>
  );
}

function ArticleCard({ article }: { article: VitrineArticleSummary }) {
  return (
    <Link href={`/actualites/${article.slug}`} className="article-card">
      {article.coverImageUrl ? (
        <div className="article-card__cover">
          <img src={article.coverImageUrl} alt={article.title} />
        </div>
      ) : null}
      <div className="article-card__body">
        {article.publishedAt ? (
          <div className="article-card__date">
            {formatDate(article.publishedAt)}
          </div>
        ) : null}
        <h3 className="article-card__title">{article.title}</h3>
        {article.excerpt ? (
          <p className="article-card__excerpt">{article.excerpt}</p>
        ) : null}
        <span className="article-card__cta">Lire →</span>
      </div>
    </Link>
  );
}
