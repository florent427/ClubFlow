import { useEffect } from 'react';
import { createPortal } from 'react-dom';

type SlotLike = {
  id: string;
  title: string;
  venueId: string;
  coachMemberId: string;
  startsAt: string;
  endsAt: string;
  dynamicGroupId: string | null;
};

type CourseSlotDetailModalProps = {
  open: boolean;
  onClose: () => void;
  slot: SlotLike | null;
  venueLabel: string;
  coachLabel: string;
  groupLabel: string | null;
  timeRangeLabel: string;
  onDuplicate: () => void;
  onDelete: () => void;
};

export function CourseSlotDetailModal({
  open,
  onClose,
  slot,
  venueLabel,
  coachLabel,
  groupLabel,
  timeRangeLabel,
  onDuplicate,
  onDelete,
}: CourseSlotDetailModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !slot || typeof document === 'undefined') {
    return null;
  }

  const node = (
    <div
      className="quick-message-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="members-family-modal"
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
            Créneau
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
        <div style={{ padding: '0 1rem 1rem' }}>
          <p style={{ margin: '0 0 0.75rem', fontWeight: 700, fontSize: '1.05rem' }}>
            {slot.title}
          </p>
          <dl
            style={{
              margin: 0,
              display: 'grid',
              gap: '0.5rem',
              fontSize: '0.9rem',
            }}
          >
            <div>
              <dt className="muted" style={{ fontSize: '0.75rem' }}>
                Horaire
              </dt>
              <dd style={{ margin: 0 }}>{timeRangeLabel}</dd>
            </div>
            <div>
              <dt className="muted" style={{ fontSize: '0.75rem' }}>
                Lieu
              </dt>
              <dd style={{ margin: 0 }}>{venueLabel}</dd>
            </div>
            <div>
              <dt className="muted" style={{ fontSize: '0.75rem' }}>
                Professeur
              </dt>
              <dd style={{ margin: 0 }}>{coachLabel}</dd>
            </div>
            {groupLabel ? (
              <div>
                <dt className="muted" style={{ fontSize: '0.75rem' }}>
                  Groupe
                </dt>
                <dd style={{ margin: 0 }}>{groupLabel}</dd>
              </div>
            ) : null}
          </dl>
        </div>
        <div className="members-family-modal__actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Fermer
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              onDuplicate();
              onClose();
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden>
              content_copy
            </span>
            Dupliquer
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ color: 'var(--cf-danger, #ba1a1a)' }}
            onClick={() => {
              if (confirm('Supprimer ce créneau ?')) {
                onDelete();
                onClose();
              }
            }}
          >
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
