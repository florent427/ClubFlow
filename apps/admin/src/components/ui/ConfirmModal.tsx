import { useEffect } from 'react';
import type { ReactNode } from 'react';

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, loading, onCancel]);
  if (!open) return null;
  return (
    <>
      <div
        className="cf-modal-backdrop"
        role="presentation"
        onClick={() => !loading && onCancel()}
      />
      <div
        className="cf-modal cf-modal--confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cf-confirm-title"
      >
        <h2 id="cf-confirm-title" className="cf-modal-title">
          {title}
        </h2>
        {message ? <p className="cf-modal-lede">{message}</p> : null}
        <div className="cf-modal-actions">
          <button
            type="button"
            className="btn-ghost"
            disabled={loading}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? 'btn-danger' : 'btn-primary'}
            disabled={loading}
            onClick={onConfirm}
          >
            {loading ? '…' : confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
