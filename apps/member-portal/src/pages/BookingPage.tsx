import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import {
  VIEWER_BOOKABLE_COURSE_SLOTS,
  VIEWER_BOOK_COURSE_SLOT,
  VIEWER_CANCEL_COURSE_SLOT_BOOKING,
} from '../lib/viewer-documents';
import type {
  ViewerBookableCourseSlotsData,
  ViewerBookableSlot,
} from '../lib/viewer-types';

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      dateStyle: 'full',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function SlotCard({
  slot,
  onChanged,
}: {
  slot: ViewerBookableSlot;
  onChanged: () => void;
}) {
  const [book, { loading: booking }] = useMutation(VIEWER_BOOK_COURSE_SLOT);
  const [cancel, { loading: cancelling }] = useMutation(
    VIEWER_CANCEL_COURSE_SLOT_BOOKING,
  );
  const [error, setError] = useState<string | null>(null);

  const isBooked = slot.viewerBookingStatus === 'BOOKED';
  const isWait = slot.viewerBookingStatus === 'WAITLISTED';
  const now = Date.now();
  const notYetOpen =
    slot.bookingOpensAt && new Date(slot.bookingOpensAt).getTime() > now;
  const closed =
    slot.bookingClosesAt && new Date(slot.bookingClosesAt).getTime() < now;
  const isFull =
    slot.bookingCapacity !== null && slot.bookedCount >= slot.bookingCapacity;

  async function onBook() {
    setError(null);
    try {
      await book({ variables: { slotId: slot.id } });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  }
  async function onCancel() {
    setError(null);
    try {
      await cancel({ variables: { slotId: slot.id } });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  }

  return (
    <article className="mp-event-card">
      <header className="mp-event-card__head">
        <h3 className="mp-event-card__title">{slot.title}</h3>
        {isBooked ? (
          <span className="mp-pill-ok">Réservé</span>
        ) : isWait ? (
          <span className="mp-pill-warn">En attente</span>
        ) : null}
      </header>
      <div className="mp-event-card__meta">
        <span>
          <span className="material-symbols-outlined" aria-hidden>
            schedule
          </span>
          {fmtDateTime(slot.startsAt)}
        </span>
        <span>
          <span className="material-symbols-outlined" aria-hidden>
            place
          </span>
          {slot.venueName}
        </span>
        <span>
          <span className="material-symbols-outlined" aria-hidden>
            person
          </span>
          {slot.coachFirstName} {slot.coachLastName}
        </span>
        <span>
          <span className="material-symbols-outlined" aria-hidden>
            group
          </span>
          {slot.bookedCount}
          {slot.bookingCapacity !== null ? ` / ${slot.bookingCapacity}` : ''}
          {slot.waitlistCount > 0 ? ` (+${slot.waitlistCount} attente)` : ''}
        </span>
      </div>
      {error ? <p className="mp-error">{error}</p> : null}
      <div className="mp-event-card__actions">
        {isBooked || isWait ? (
          <button
            type="button"
            className="mp-btn"
            onClick={() => void onCancel()}
            disabled={cancelling}
          >
            Annuler ma réservation
          </button>
        ) : notYetOpen ? (
          <span className="mp-muted">
            Ouvre le {fmtDateTime(slot.bookingOpensAt!)}
          </span>
        ) : closed ? (
          <span className="mp-muted">Réservations fermées</span>
        ) : (
          <button
            type="button"
            className="mp-btn-primary"
            onClick={() => void onBook()}
            disabled={booking}
          >
            {isFull ? 'Liste d’attente' : 'Réserver'}
          </button>
        )}
      </div>
    </article>
  );
}

export function BookingPage() {
  const { data, loading, refetch } = useQuery<ViewerBookableCourseSlotsData>(
    VIEWER_BOOKABLE_COURSE_SLOTS,
  );
  const slots = data?.viewerBookableCourseSlots ?? [];
  return (
    <section className="mp-page">
      <header className="mp-page__header">
        <h1 className="mp-page__title">Réservations</h1>
        <p className="mp-page__subtitle">
          Réservez votre place sur les créneaux ouverts.
        </p>
      </header>
      {loading && slots.length === 0 ? (
        <p className="mp-muted">Chargement…</p>
      ) : slots.length === 0 ? (
        <p className="mp-empty">Aucun créneau ouvert à la réservation.</p>
      ) : (
        <div className="mp-event-list">
          {slots.map((s) => (
            <SlotCard key={s.id} slot={s} onChanged={() => void refetch()} />
          ))}
        </div>
      )}
    </section>
  );
}
