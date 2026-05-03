import { useQuery } from '@apollo/client/react';
import { useOutletContext } from 'react-router-dom';
import { PUBLIC_CLUB_ANNOUNCEMENTS } from '../../lib/public-documents';
import type { PublicAnnouncementsQueryData } from '../../lib/public-types';

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

export function PublicNewsPage() {
  const { slug } = useOutletContext<Ctx>();
  const { data, loading } = useQuery<PublicAnnouncementsQueryData>(
    PUBLIC_CLUB_ANNOUNCEMENTS,
    { variables: { clubSlug: slug, limit: 30 } },
  );
  const announcements = data?.publicClubAnnouncements ?? [];

  return (
    <div className="ps-page">
      <h1 className="ps-page-title">Actualités du club</h1>
      {loading && announcements.length === 0 ? (
        <p className="ps-muted">Chargement…</p>
      ) : announcements.length === 0 ? (
        <p className="ps-muted">Aucune actualité pour le moment.</p>
      ) : (
        <ul className="ps-news-list">
          {announcements.map((a) => (
            <li key={a.id} className="ps-news-item">
              <div className="ps-news-item__head">
                <h2>{a.title}</h2>
                {a.pinned ? <span className="ps-pin">Épinglé</span> : null}
              </div>
              <p className="ps-muted">{fmtDate(a.publishedAt)}</p>
              <p className="ps-news-item__body">{a.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
