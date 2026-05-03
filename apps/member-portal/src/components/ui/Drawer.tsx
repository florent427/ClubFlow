import { useEffect } from 'react';
import type { ReactNode } from 'react';

export function Drawer({
  open,
  title,
  onClose,
  children,
  footer,
  width = 520,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="mp-drawer-backdrop" role="presentation" onClick={onClose} />
      <aside
        className="mp-drawer"
        style={{ width: `min(100vw, ${width}px)` }}
        role="dialog"
        aria-modal="true"
      >
        <header className="mp-drawer__header">
          <h2 className="mp-drawer__title">{title}</h2>
          <button
            type="button"
            className="mp-drawer__close"
            onClick={onClose}
            aria-label="Fermer"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>
        <div className="mp-drawer__body">{children}</div>
        {footer ? <footer className="mp-drawer__footer">{footer}</footer> : null}
      </aside>
    </>
  );
}
