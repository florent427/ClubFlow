import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import {
  CLUB_COURSE_SLOTS,
  CLUB_COURSE_SLOT_BOOKINGS,
  UPDATE_CLUB_COURSE_SLOT,
} from '../../lib/documents';
import type {
  ClubCourseSlotBookingsQueryData,
  CourseSlotsQueryData,
} from '../../lib/types';
import { Drawer, EmptyState } from '../../components/ui';
import { useToast } from '../../components/ToastProvider';

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function toLocalInputValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type SlotRow = CourseSlotsQueryData['clubCourseSlots'][number];

export function BookingPage() {
  const { showToast } = useToast();
  const { data, refetch, loading } =
    useQuery<CourseSlotsQueryData>(CLUB_COURSE_SLOTS);
  const [update, { loading: saving }] = useMutation(UPDATE_CLUB_COURSE_SLOT);
  const [editing, setEditing] = useState<SlotRow | null>(null);
  const [detailSlotId, setDetailSlotId] = useState<string | null>(null);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return [...(data?.clubCourseSlots ?? [])]
      .filter((s) => new Date(s.endsAt).getTime() >= now)
      .sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1));
  }, [data]);

  const [form, setForm] = useState({
    bookingEnabled: false,
    bookingCapacity: '',
    bookingOpensAt: '',
    bookingClosesAt: '',
  });

  function openEdit(s: SlotRow) {
    setEditing(s);
    setForm({
      bookingEnabled: s.bookingEnabled,
      bookingCapacity:
        s.bookingCapacity !== null ? String(s.bookingCapacity) : '',
      bookingOpensAt: toLocalInputValue(s.bookingOpensAt),
      bookingClosesAt: toLocalInputValue(s.bookingClosesAt),
    });
  }

  async function onSave() {
    if (!editing) return;
    try {
      await update({
        variables: {
          input: {
            id: editing.id,
            bookingEnabled: form.bookingEnabled,
            bookingCapacity: form.bookingCapacity
              ? parseInt(form.bookingCapacity, 10)
              : null,
            bookingOpensAt: form.bookingOpensAt
              ? new Date(form.bookingOpensAt).toISOString()
              : null,
            bookingClosesAt: form.bookingClosesAt
              ? new Date(form.bookingClosesAt).toISOString()
              : null,
          },
        },
      });
      showToast('Créneau mis à jour', 'success');
      setEditing(null);
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  return (
    <section className="cf-page">
      <header className="cf-page__header">
        <div>
          <h1 className="cf-page__title">Réservations</h1>
          <p className="cf-page__subtitle">
            Activez la réservation sur les créneaux, définissez la capacité,
            suivez les participants.
          </p>
        </div>
      </header>

      {loading && upcoming.length === 0 ? (
        <p className="cf-muted">Chargement…</p>
      ) : upcoming.length === 0 ? (
        <EmptyState
          icon="event_available"
          title="Aucun créneau à venir"
          message="Créez d’abord des créneaux dans Planning sportif."
        />
      ) : (
        <ul className="cf-event-list">
          {upcoming.map((s) => (
            <li key={s.id} className="cf-event-card">
              <div className="cf-event-card__head">
                <h3 className="cf-event-card__title">{s.title}</h3>
                <span
                  className={`cf-pill cf-pill--${
                    s.bookingEnabled ? 'ok' : 'muted'
                  }`}
                >
                  {s.bookingEnabled ? 'Réservation ouverte' : 'Réservation fermée'}
                </span>
              </div>
              <div className="cf-event-card__meta">
                <span>
                  <span className="material-symbols-outlined" aria-hidden>
                    schedule
                  </span>
                  {fmtDateTime(s.startsAt)}
                </span>
                <span>
                  <span className="material-symbols-outlined" aria-hidden>
                    group
                  </span>
                  {s.bookedCount}
                  {s.bookingCapacity !== null ? ` / ${s.bookingCapacity}` : ''}{' '}
                  réservé{s.bookedCount > 1 ? 's' : ''}
                  {s.waitlistCount > 0
                    ? ` (+${s.waitlistCount} attente)`
                    : ''}
                </span>
              </div>
              <div className="cf-event-card__actions">
                <button
                  type="button"
                  className="cf-btn"
                  onClick={() => setDetailSlotId(s.id)}
                >
                  Voir les participants
                </button>
                <button
                  type="button"
                  className="cf-btn cf-btn--primary"
                  onClick={() => openEdit(s)}
                >
                  Configurer la réservation
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Drawer
        open={editing !== null}
        title={editing ? `Configurer : ${editing.title}` : ''}
        onClose={() => setEditing(null)}
        width={540}
      >
        {editing ? (
          <div className="cf-form">
            <label className="cf-checkbox">
              <input
                type="checkbox"
                checked={form.bookingEnabled}
                onChange={(e) =>
                  setForm({ ...form, bookingEnabled: e.target.checked })
                }
              />
              <span>Autoriser la réservation sur ce créneau</span>
            </label>
            <label className="cf-field">
              <span className="cf-field__label">Capacité (laisser vide = illimitée)</span>
              <input
                type="number"
                min={0}
                className="cf-input"
                value={form.bookingCapacity}
                onChange={(e) =>
                  setForm({ ...form, bookingCapacity: e.target.value })
                }
              />
            </label>
            <div className="cf-form-row">
              <label className="cf-field">
                <span className="cf-field__label">Ouverture des réservations</span>
                <input
                  type="datetime-local"
                  className="cf-input"
                  value={form.bookingOpensAt}
                  onChange={(e) =>
                    setForm({ ...form, bookingOpensAt: e.target.value })
                  }
                />
              </label>
              <label className="cf-field">
                <span className="cf-field__label">Clôture des réservations</span>
                <input
                  type="datetime-local"
                  className="cf-input"
                  value={form.bookingClosesAt}
                  onChange={(e) =>
                    setForm({ ...form, bookingClosesAt: e.target.value })
                  }
                />
              </label>
            </div>
            <div className="cf-form-actions">
              <button
                type="button"
                className="cf-btn"
                onClick={() => setEditing(null)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="cf-btn cf-btn--primary"
                onClick={() => void onSave()}
                disabled={saving}
              >
                Enregistrer
              </button>
            </div>
          </div>
        ) : null}
      </Drawer>

      <Drawer
        open={detailSlotId !== null}
        title="Participants"
        onClose={() => setDetailSlotId(null)}
        width={520}
      >
        {detailSlotId ? <BookingsList slotId={detailSlotId} /> : null}
      </Drawer>
    </section>
  );
}

function BookingsList({ slotId }: { slotId: string }) {
  const { data, loading } = useQuery<ClubCourseSlotBookingsQueryData>(
    CLUB_COURSE_SLOT_BOOKINGS,
    { variables: { slotId }, fetchPolicy: 'cache-and-network' },
  );
  const rows = data?.clubCourseSlotBookings ?? [];
  if (loading && rows.length === 0)
    return <p className="cf-muted">Chargement…</p>;
  if (rows.length === 0)
    return <p className="cf-muted">Aucun participant pour le moment.</p>;
  return (
    <ul className="cf-registration-list">
      {rows.map((r) => (
        <li
          key={r.id}
          className={`cf-registration${
            r.status === 'CANCELLED' ? ' cf-registration--cancelled' : ''
          }`}
        >
          <span className="cf-registration__name">{r.displayName}</span>
          <span
            className={`cf-pill cf-pill--${
              r.status === 'BOOKED'
                ? 'ok'
                : r.status === 'WAITLISTED'
                  ? 'warn'
                  : 'muted'
            }`}
          >
            {r.status === 'BOOKED'
              ? 'Réservé'
              : r.status === 'WAITLISTED'
                ? 'En attente'
                : 'Annulé'}
          </span>
        </li>
      ))}
    </ul>
  );
}
