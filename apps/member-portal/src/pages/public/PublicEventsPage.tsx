import { useQuery } from '@apollo/client/react';
import { useOutletContext } from 'react-router-dom';
import { PUBLIC_CLUB_EVENTS } from '../../lib/public-documents';
import type { PublicEventsQueryData } from '../../lib/public-types';

type Ctx = { slug: string; clubName: string };

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      dateStyle: 'full',
      timeStyle: 'short',
    });
  } catch {
    return '';
  }
}

export function PublicEventsPage() {
  const { slug } = useOutletContext<Ctx>();
  const { data, loading } = useQuery<PublicEventsQueryData>(
    PUBLIC_CLUB_EVENTS,
    { variables: { clubSlug: slug, limit: 50 } },
  );
  const events = data?.publicClubEvents ?? [];

  return (
    <div className="ps-page">
      <h1 className="ps-page-title">Événements à venir</h1>
      {loading && events.length === 0 ? (
        <p className="ps-muted">Chargement…</p>
      ) : events.length === 0 ? (
        <p className="ps-muted">Aucun événement programmé.</p>
      ) : (
        <ul className="ps-event-list">
          {events.map((e) => (
            <li key={e.id} className="ps-event-card">
              <h2>{e.title}</h2>
              <p className="ps-muted">{fmtDateTime(e.startsAt)}</p>
              {e.location ? (
                <p className="ps-event-card__loc">📍 {e.location}</p>
              ) : null}
              {e.description ? (
                <p className="ps-event-card__desc">{e.description}</p>
              ) : null}
              <p className="ps-event-card__cta">
                Inscription réservée aux membres — <a href="/login">connectez-vous</a>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
