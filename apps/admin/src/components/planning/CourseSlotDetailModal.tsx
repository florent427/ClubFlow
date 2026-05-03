import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  DynamicGroupsQueryData,
  MembersQueryData,
  VenuesQueryData,
} from '../../lib/types';

/**
 * Modal de détail/édition d'un créneau (mode 'edit').
 * Utilisé aussi en mode 'create' avec un slot draft.
 */

export type CourseSlotDraft = {
  id?: string; // undefined = create
  title: string;
  venueId: string;
  coachMemberId: string;
  /** ISO string (UTC). */
  startsAt: string;
  endsAt: string;
  dynamicGroupId: string | null;
  bookingEnabled: boolean;
  bookingCapacity: number | null;
};

type CourseSlotDetailModalProps = {
  open: boolean;
  onClose: () => void;
  mode: 'edit' | 'create';
  initial: CourseSlotDraft | null;
  venues: VenuesQueryData['clubVenues'];
  coaches: MembersQueryData['clubMembers'];
  groups: DynamicGroupsQueryData['clubDynamicGroups'];
  onSave: (draft: CourseSlotDraft) => Promise<void> | void;
  onDuplicate?: () => void;
  onDelete?: () => void;
};

/** Convertit ISO UTC en valeur `datetime-local` (YYYY-MM-DDTHH:mm). */
function isoToLocalInput(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}

function localInputToIso(local: string): string {
  if (!local) return '';
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

export function CourseSlotDetailModal({
  open,
  onClose,
  mode,
  initial,
  venues,
  coaches,
  groups,
  onSave,
  onDuplicate,
  onDelete,
}: CourseSlotDetailModalProps) {
  const [title, setTitle] = useState('');
  const [venueId, setVenueId] = useState('');
  const [coachId, setCoachId] = useState('');
  const [starts, setStarts] = useState('');
  const [ends, setEnds] = useState('');
  const [groupId, setGroupId] = useState('');
  const [bookingEnabled, setBookingEnabled] = useState(false);
  const [bookingCapacity, setBookingCapacity] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!initial) return;
    setTitle(initial.title);
    setVenueId(initial.venueId);
    setCoachId(initial.coachMemberId);
    setStarts(isoToLocalInput(initial.startsAt));
    setEnds(isoToLocalInput(initial.endsAt));
    setGroupId(initial.dynamicGroupId ?? '');
    setBookingEnabled(initial.bookingEnabled);
    setBookingCapacity(
      initial.bookingCapacity != null ? String(initial.bookingCapacity) : '',
    );
    setError(null);
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !initial || typeof document === 'undefined') {
    return null;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError('Titre obligatoire.');
      return;
    }
    if (!venueId) {
      setError('Lieu obligatoire.');
      return;
    }
    if (!coachId) {
      setError('Professeur obligatoire.');
      return;
    }
    if (!starts || !ends) {
      setError('Dates obligatoires.');
      return;
    }
    const startsIso = localInputToIso(starts);
    const endsIso = localInputToIso(ends);
    if (!startsIso || !endsIso) {
      setError('Dates invalides.');
      return;
    }
    if (new Date(endsIso) <= new Date(startsIso)) {
      setError('La fin doit être après le début.');
      return;
    }
    let capacity: number | null = null;
    if (bookingEnabled) {
      const n = Number.parseInt(bookingCapacity, 10);
      if (!Number.isFinite(n) || n <= 0) {
        setError('Capacité requise si la réservation est activée.');
        return;
      }
      capacity = n;
    }
    setSaving(true);
    try {
      await onSave({
        id: initial?.id,
        title: title.trim(),
        venueId,
        coachMemberId: coachId,
        startsAt: startsIso,
        endsAt: endsIso,
        dynamicGroupId: groupId || null,
        bookingEnabled,
        bookingCapacity: capacity,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue.');
    } finally {
      setSaving(false);
    }
  }

  const node = (
    <div
      className="quick-message-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="members-family-modal slot-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="course-slot-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="members-family-modal__head">
          <h2
            className="members-family-modal__title"
            id="course-slot-detail-title"
          >
            {mode === 'create' ? 'Nouveau créneau' : 'Modifier le créneau'}
          </h2>
          <button
            type="button"
            className="btn btn-ghost btn-tight"
            onClick={onClose}
            aria-label="Fermer"
          >
            <span className="material-symbols-outlined" aria-hidden>
              close
            </span>
          </button>
        </div>
        <form className="slot-edit-form" onSubmit={(e) => void handleSave(e)}>
          {error ? <p className="form-error">{error}</p> : null}

          <label className="field">
            <span>Titre</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Cours enfant"
              autoFocus={mode === 'create'}
            />
          </label>

          <div className="slot-edit-form__row">
            <label className="field">
              <span>Début</span>
              <input
                type="datetime-local"
                value={starts}
                onChange={(e) => setStarts(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Fin</span>
              <input
                type="datetime-local"
                value={ends}
                onChange={(e) => setEnds(e.target.value)}
              />
            </label>
          </div>

          <div className="slot-edit-form__row">
            <label className="field">
              <span>Lieu</span>
              <select
                value={venueId}
                onChange={(e) => setVenueId(e.target.value)}
              >
                <option value="">— Choisir —</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Professeur</span>
              <select
                value={coachId}
                onChange={(e) => setCoachId(e.target.value)}
              >
                <option value="">— Choisir —</option>
                {coaches
                  .filter((c) => c.roles.includes('COACH'))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.firstName} {c.lastName}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>Groupe dynamique (optionnel)</span>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
            >
              <option value="">— Aucun —</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="slot-edit-form__booking">
            <legend>Réservation membre</legend>
            <label className="slot-edit-form__toggle">
              <input
                type="checkbox"
                checked={bookingEnabled}
                onChange={(e) => setBookingEnabled(e.target.checked)}
              />
              <span>Activer la réservation de ce cours par les membres</span>
            </label>
            {bookingEnabled ? (
              <label className="field">
                <span>Capacité max (places)</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={bookingCapacity}
                  onChange={(e) => setBookingCapacity(e.target.value)}
                  placeholder="ex. 20"
                />
              </label>
            ) : null}
          </fieldset>

          <div className="members-family-modal__actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
            >
              {saving ? '…' : mode === 'create' ? 'Créer' : 'Enregistrer'}
            </button>
            {mode === 'edit' && onDuplicate ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  onDuplicate();
                  onClose();
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '1rem' }}
                  aria-hidden
                >
                  content_copy
                </span>
                Dupliquer
              </button>
            ) : null}
            {mode === 'edit' && onDelete ? (
              <button
                type="button"
                className="btn btn-ghost slot-edit-form__delete"
                onClick={() => {
                  if (confirm('Supprimer ce créneau ?')) {
                    onDelete();
                    onClose();
                  }
                }}
              >
                Supprimer
              </button>
            ) : null}
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Annuler
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
