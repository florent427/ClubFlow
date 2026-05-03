import Link from 'next/link';
import { SectionHeader } from './SectionHeader';
import type { EditContext } from '@/lib/edit-context';
import styles from './FeaturedArticlesSection.module.css';

export interface FeaturedArticle {
  slug: string;
  title: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  publishedAt: string | null;
}

export interface FeaturedArticlesSectionProps {
  label?: string;
  title?: string;
  titleEm?: string;
  intro?: string;
  articles: FeaturedArticle[];
  emptyText?: string;
  __editSectionId?: string;
  __edit?: EditContext;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export function FeaturedArticlesSection({
  label,
  title,
  titleEm,
  intro,
  articles,
  emptyText,
  __editSectionId,
  __edit,
}: FeaturedArticlesSectionProps) {
  const sectionId = __editSectionId ?? '';
  const edit = __edit;
  return (
    <section className="section">
      <div className="container">
        {title ? (
          <SectionHeader
            label={label}
            title={title}
            titleEm={titleEm}
            intro={intro}
            sectionId={sectionId}
            edit={edit}
          />
        ) : null}
        {articles.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>
            {emptyText ?? 'Aucune actualité publiée pour le moment.'}
          </p>
        ) : (
          <div className={styles.grid}>
            {articles.map((a, i) => (
              <article
                key={a.slug}
                className={i === 0 ? styles.featured : styles.card}
              >
                <Link href={`/blog/${a.slug}`} className={styles.link}>
                  {a.coverImageUrl ? (
                    <div
                      className={styles.cover}
                      style={{ backgroundImage: `url(${a.coverImageUrl})` }}
                    />
                  ) : (
                    <div className={styles.cover} />
                  )}
                  <div className={styles.body}>
                    <span className={styles.date}>
                      {formatDate(a.publishedAt)}
                    </span>
                    <h3 className={styles.title}>{a.title}</h3>
                    {a.excerpt ? (
                      <p className={styles.excerpt}>{a.excerpt}</p>
                    ) : null}
                    <span className={styles.more}>Lire →</span>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
