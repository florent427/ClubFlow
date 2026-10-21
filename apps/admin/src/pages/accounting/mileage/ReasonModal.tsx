import { useState } from 'react';
import type { ReactNode } from 'react';
import { ConfirmModal } from '../../../components/ui';

type ReasonModalProps = {
  open: boolean;
  title: string;
  lede?: ReactNode;
  label: string;
  confirmLabel: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: (text: string) => void;
  onCancel: () => void;
};

/**
 * Confirmation qui exige un texte (commentaire de renvoi, motif de refus
 * ou d'annulation). Rien n'est envoyé tant que le texte est vide ; il
 * repart vide à chaque ouverture (le contenu n'est monté qu'ouvert).
 */
export function ReasonModal(props: ReasonModalProps) {
  return props.open ? <OpenReasonModal {...props} /> : null;
}

function OpenReasonModal({
  open,
  title,
  lede,
  label,
  confirmLabel,
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: ReasonModalProps) {
  const [text, setText] = useState('');
  const trimmed = text.trim();
  return (
    <ConfirmModal
      open={open}
      title={title}
      danger={danger}
      loading={loading}
      confirmLabel={confirmLabel}
      onCancel={onCancel}
      onConfirm={() => {
        if (trimmed) onConfirm(trimmed);
      }}
      message={
        <>
          {lede ? (
            <>
              {lede}
              <br />
            </>
          ) : null}
          <span style={{ display: 'block', marginTop: 8, fontWeight: 600 }}>{label} *</span>
          <textarea
            value={text}
            rows={4}
            autoFocus
            style={{ width: '100%', marginTop: 4, boxSizing: 'border-box' }}
            onChange={(e) => setText(e.target.value)}
          />
          {trimmed ? null : (
            <small className="cf-muted" style={{ display: 'block' }}>
              Obligatoire.
            </small>
          )}
        </>
      }
    />
  );
}
