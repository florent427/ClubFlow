import { useQuery } from '@apollo/client/react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  PUBLIC_CLUB_ANNOUNCEMENTS,
  PUBLIC_CLUB_BLOG_POSTS,
  PUBLIC_CLUB_EVENTS,
} from '../../lib/public-documents';
import type {
  PublicAnnouncementsQueryData,
  PublicBlogPostsQueryData,
  PublicEventsQueryData,
} from '../../lib/public-types';

type Ctx = { slug: string; clubName: string };

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return '';
  }
}

export function PublicHomePage() {
  const { slug, clubName } = useOutletContext<Ctx>();
  const base = `/site/${slug}`;

  const { data: annData } = useQuery<PublicAnnouncementsQueryData>(
    PUBLIC_CLUB_ANNOUNCEMENTS,
    { variables: { clubSlug: slug, limit: 3 } },
  );
  const { data: evtData } = useQuery<PublicEventsQueryData>(
    PUBLIC_CLUB_EVENTS,
    { variables: { clubSlug: slug, limit: 3 } },
  );
  const { data: blogData } = useQuery<PublicBlogPostsQueryData>(
    PUBLIC_CLUB_BLOG_POSTS,
    { variables: { clubSlug: slug, limit: 3 } },
  );

  const announcements = annData?.publicClubAnnouncements ?? [];
  const events = evtData?.publicClubEvents ?? [];
  const posts = blogData?.publicClubBlogPosts ?? [];

  return (
    <div className="ps-page">
      <section className="ps-hero">
        <h1 className="ps-hero__title">{clubName}</h1>
        <p className="ps-hero__subtitle">
          Retrouvez toute l’actualité du club, nos événements et articles.
        </p>
      </section>

      <section className="ps-section">
        <div className="ps-section__head">
          <h2>Dernières actualités</h2>
          <Link to={`${base}/actus`} className="ps-link">Tout voir →</Link>
        </div>
        {announcements.length === 0 ? (
          <p className="ps-muted">Aucune actualité pour le moment.</p>
        ) : (
          <ul className="ps-card-list">
            {announcements.map((a) => (
              <li key={a.id} className="ps-card">
                <h3>{a.title}</h3>
                <p className="ps-muted">{fmtDate(a.publishedAt)}</p>
                <p className="ps-card__excerpt">{a.body.slice(0, 180)}{a.body.length > 180 ? '…' : ''}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ps-section">
        <div className="ps-section__head">
          <h2>Prochains événements</h2>
          <Link to={`${base}/evenements`} className="ps-link">Tout voir →</Link>
        </div>
        {events.length === 0 ? (
          <p className="ps-muted">Aucun événement programmé pour l’instant.</p>
        ) : (
          <ul className="ps-card-list">
            {events.map((e) => (
              <li key={e.id} className="ps-card">
                <h3>{e.title}</h3>
                <p className="ps-muted">{fmtDateTime(e.startsAt)}</p>
                {e.location ? <p>{e.location}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ps-section">
        <div className="ps-section__head">
          <h2>Derniers articles</h2>
          <Link to={`${base}/blog`} className="ps-link">Tout voir →</Link>
        </div>
        {posts.length === 0 ? (
          <p className="ps-muted">Aucun article publié.</p>
        ) : (
          <ul className="ps-card-list">
            {posts.map((p) => (
              <li key={p.id} className="ps-card">
                <Link to={`${base}/blog/${p.slug}`} className="ps-card__link">
                  {p.coverImageUrl ? (
                    <img src={p.coverImageUrl} alt="" className="ps-card__cover" />
                  ) : null}
                  <h3>{p.title}</h3>
                  <p className="ps-muted">{fmtDate(p.publishedAt)}</p>
                  {p.excerpt ? <p className="ps-card__excerpt">{p.excerpt}</p> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
