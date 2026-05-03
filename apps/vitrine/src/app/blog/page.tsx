import type { Metadata } from 'next';
import Link from 'next/link';
import { resolveCurrentClub } from '@/lib/club-resolution';
import {
  fetchArticles,
  fetchCategories,
  type VitrineArticleSummary,
  type VitrineCategoryPublic,
} from '@/lib/page-fetchers';
import { PageHero } from '@/blocks/PageHero';
import { buildPageMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    pageSlug: 'blog',
    fallbackTitle: 'Blog',
    fallbackDescription:
      'Articles de fond du club : récits de stages, techniques, portraits.',
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
 * Page publique du blog.
 *
 * Liste les articles de fond (VitrineArticle, status=PUBLISHED) — contenu
 * long, SEO-optimisé, avec catégories et commentaires. À distinguer des
 * « Actualités » (VitrineAnnouncement) qui sont des news courtes.
 */
export default async function BlogPage() {
  const club = await resolveCurrentClub();
  const [articles, categories] = await Promise.all([
    fetchArticles(club.slug, 50, 'BLOG'),
    fetchCategories(club.slug),
  ]);

  return (
    <article>
      <PageHero
        label="Blog"
        kanji="筆"
        title="Articles & récits"
        subtitle="Récits de stages, techniques, portraits, retours d'expérience."
      />

      <section className="section">
        <div className="container">
          {categories.length > 0 ? (
            <CategoryNav
              categories={categories.filter((c) => c.articleCount > 0)}
              currentSlug={null}
              totalArticles={articles.length}
            />
          ) : null}

          {articles.length === 0 ? (
            <p
              className="muted"
              style={{ textAlign: 'center', padding: '48px 0' }}
            >
              Aucun article publié pour le moment.
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

function CategoryNav({
  categories,
  currentSlug,
  totalArticles,
}: {
  categories: VitrineCategoryPublic[];
  currentSlug: string | null;
  totalArticles: number;
}) {
  return (
    <nav className="category-nav">
      <Link
        href="/blog"
        className={
          currentSlug === null
            ? 'category-nav__link category-nav__link--active'
            : 'category-nav__link'
        }
      >
        Tous{' '}
        <span className="muted" style={{ opacity: 0.6 }}>
          ({totalArticles})
        </span>
      </Link>
      {categories.map((c) => (
        <Link
          key={c.id}
          href={`/blog/categorie/${c.slug}`}
          className={
            c.slug === currentSlug
              ? 'category-nav__link category-nav__link--active'
              : 'category-nav__link'
          }
          style={
            c.color && c.slug === currentSlug
              ? { background: c.color, color: '#fff', borderColor: c.color }
              : c.color
                ? { color: c.color }
                : undefined
          }
        >
          {c.name}{' '}
          <span className="muted" style={{ opacity: 0.6 }}>
            ({c.articleCount})
          </span>
        </Link>
      ))}
    </nav>
  );
}

function ArticleCard({ article }: { article: VitrineArticleSummary }) {
  return (
    <Link href={`/blog/${article.slug}`} className="article-card">
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
