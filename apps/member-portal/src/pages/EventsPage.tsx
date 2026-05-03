import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import {
  VIEWER_CANCEL_EVENT_REGISTRATION,
  VIEWER_CLUB_EVENTS,
  VIEWER_REGISTER_TO_EVENT,
} from '../lib/viewer-documents';
import type {
  ViewerClubEvent,
  ViewerClubEventsData,
} from '../lib/viewer-types';

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      dateStyle: 'full',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function fmtPrice(cents: number | null): string {
  if (cents === null) return 'Gratuit';
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

function EventCard({
  event,
  onChanged,
}: {
  event: ViewerClubEvent;
  onChanged: () => void;
}) {
  const [register, { loading: registering }] = useMutation(
    VIEWER_REGISTER_TO_EVENT,
  );
  const [cancel, { loading: cancelling }] = useMutation(
    VIEWER_CANCEL_EVENT_REGISTRATION,
  );
  const [error, setError] = useState<string | null>(null);

  const isRegistered = event.viewerRegistrationStatus === 'REGISTERED';
  const isWaitlisted = event.viewerRegistrationStatus === 'WAITLISTED';
  const now = Date.now();
  const opensAt = event.registrationOpensAt
    ? new Date(event.registrationOpensAt).getTime()
    : null;
  const closesAt = event.registrationClosesAt
    ? new Date(event.registrationClosesAt).getTime()
    : null;
  const notYetOpen = opensAt !== null && opensAt > now;
  const closed = closesAt !== null && closesAt < now;
  const isFull =
    event.capacity !== null && event.registeredCount >= event.capacity;

  async function onRegister() {
    setError(null);
    try {
      await register({ variables: { eventId: event.id } });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  }
  async function onCancel() {
    setError(null);
    try {
      await cancel({ variables: { eventId: event.id } });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  }

  return (
    <article className="mp-event-card">
      <header className="mp-event-card__head">
        <h3 className="mp-event-card__title">{event.title}</h3>
        {isRegistered ? (
          <span className="mp-pill-ok">Inscrit</span>
        ) : isWaitlisted ? (
          <span className="mp-pill-warn">En attente</span>
        ) : null}
      </header>
      <div className="mp-event-card__meta">
        <span>
          <span className="material-symbols-outlined" aria-hidden>
            schedule
          </span>
          {fmtDate(event.startsAt)}
        </span>
        {event.location ? (
          <span>
            <span className="material-symbols-outlined" aria-hidden>
              place
            </span>
            {event.location}
          </span>
        ) : null}
        <span>
          <span className="material-symbols-outlined" aria-hidden>
            group
          </span>
          {event.registeredCount}
          {event.capacity !== null ? ` / ${event.capacity}` : ''}
          {event.waitlistCount > 0 ? ` (+${event.waitlistCount} attente)` : ''}
        </span>
        <span>
          <span className="material-symbols-outlined" aria-hidden>
            euro
          </span>
          {fmtPrice(event.priceCents)}
        </span>
      </div>
      {event.description ? (
        <p className="mp-event-card__body">{event.description}</p>
      ) : null}
      {error ? <p className="mp-error">{error}</p> : null}
      <div className="mp-event-card__actions">
        {isRegistered || isWaitlisted ? (
          <button
            type="button"
            className="mp-btn"
            onClick={() => void onCancel()}
            disabled={cancelling}
          >
            Se désinscrire
          </button>
        ) : notYetOpen ? (
          <span className="mp-muted">
            Ouvre le {fmtDate(event.registrationOpensAt!)}
          </span>
        ) : closed ? (
          <span className="mp-muted">Inscriptions fermées</span>
        ) : (
          <button
            type="button"
            className="mp-btn-primary"
            onClick={() => void onRegister()}
            disabled={registering}
          >
            {isFull ? 'Rejoindre la liste d’attente' : 'S’inscrire'}
          </button>
        )}
      </div>
    </article>
  );
}

export function EventsPage() {
  const { data, loading, refetch } =
    useQuery<ViewerClubEventsData>(VIEWER_CLUB_EVENTS);
  const events = data?.viewerClubEvents ?? [];

  return (
    <section className="mp-page">
      <header className="mp-page__header">
        <h1 className="mp-page__title">Événements</h1>
        <p className="mp-page__subtitle">
          Compétitions, stages, rassemblements du club.
        </p>
      </header>
      {loading && events.length === 0 ? (
        <p className="mp-muted">Chargement…</p>
      ) : events.length === 0 ? (
        <p className="mp-empty">Aucun événement à venir pour le moment.</p>
      ) : (
        <div className="mp-event-list">
          {events.map((e) => (
            <EventCard key={e.id} event={e} onChanged={() => void refetch()} />
          ))}
        </div>
      )}
    </section>
  );
}
