import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { resolveCurrentClub } from '@/lib/club-resolution';
import {
  fetchArticlesByCategory,
  fetchCategories,
} from '@/lib/page-fetchers';
import { PageHero } from '@/blocks/PageHero';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: RouteParams): Promise<Metadata> {
  const { slug } = await params;
  const club = await resolveCurrentClub();
  const all = await fetchCategories(club.slug);
  const category = all.find((c) => c.slug === slug);
  if (!category) return { title: 'Catégorie introuvable' };
  return {
    title: `${category.name} · Blog`,
    description:
      category.description ??
      `Tous les articles dans la catégorie ${category.name}.`,
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

export default async function CategoryPage({ params }: RouteParams) {
  const { slug } = await params;
  const club = await resolveCurrentClub();
  const [categories, articles] = await Promise.all([
    fetchCategories(club.slug),
    fetchArticlesByCategory(club.slug, slug, 50),
  ]);
  const current = categories.find((c) => c.slug === slug);
  if (!current) notFound();

  return (
    <article>
      <PageHero
        label="Catégorie"
        kanji="類"
        title={current.name}
        subtitle={current.description ?? undefined}
      />

      <section className="section">
        <div className="container">
          {/* Nav sibling-catégories : on affiche TOUJOURS "Toutes" + la
              catégorie courante + les autres catégories qui ont ≥1 article.
              Ça garantit que l'utilisateur peut toujours revenir à la vue
              globale ou changer de catégorie, même si la courante est vide. */}
          <nav className="category-nav">
            <Link href="/blog" className="category-nav__link">
              Toutes
            </Link>
            {categories
              .filter((c) => c.articleCount > 0 || c.slug === slug)
              .map((c) => (
                <Link
                  key={c.id}
                  href={`/blog/categorie/${c.slug}`}
                  className={
                    c.slug === slug
                      ? 'category-nav__link category-nav__link--active'
                      : 'category-nav__link'
                  }
                  style={
                    c.color && c.slug === slug
                      ? { background: c.color, color: '#fff' }
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

          {articles.length === 0 ? (
            <p
              className="muted"
              style={{ textAlign: 'center', padding: '48px 0' }}
            >
              Aucun article publié dans cette catégorie pour le moment.
            </p>
          ) : (
            <div className="article-grid">
              {articles.map((a) => (
                <Link
                  key={a.slug}
                  href={`/blog/${a.slug}`}
                  className="article-card"
                >
                  {a.coverImageUrl ? (
                    <div className="article-card__cover">
                      <img src={a.coverImageUrl} alt={a.title} />
                    </div>
                  ) : null}
                  <div className="article-card__body">
                    {a.publishedAt ? (
                      <div className="article-card__date">
                        {formatDate(a.publishedAt)}
                      </div>
                    ) : null}
                    <h3 className="article-card__title">{a.title}</h3>
                    {a.excerpt ? (
                      <p className="article-card__excerpt">{a.excerpt}</p>
                    ) : null}
                    <span className="article-card__cta">Lire →</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </article>
  );
}
