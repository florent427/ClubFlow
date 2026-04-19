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
        className="mp-modal-backdrop"
        role="presentation"
        onClick={() => !loading && onCancel()}
      />
      <div
        className="mp-modal mp-modal--confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <h2 id="confirm-title" className="mp-modal-title">
          {title}
        </h2>
        {message ? <p className="mp-modal-lede">{message}</p> : null}
        <div className="mp-modal-actions">
          <button
            type="button"
            className="mp-btn mp-btn-outline"
            disabled={loading}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`mp-btn ${danger ? 'mp-btn-danger' : 'mp-btn-primary'}`}
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
