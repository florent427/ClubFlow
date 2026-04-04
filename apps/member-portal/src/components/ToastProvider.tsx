import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Recommandation UX #6 — Notifications toast centralisées
 * Système de notifications toast (snackbar) partagé entre tous les
 * composants du portail membre. Les messages apparaissent en
 * superposition, indépendamment de la position de défilement.
 */

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="cf-toast-container" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`cf-toast cf-toast--${t.type}`}
            role="status"
          >
            <span className="material-symbols-outlined cf-toast__ico">
              {t.type === 'success'
                ? 'check_circle'
                : t.type === 'error'
                  ? 'error'
                  : 'info'}
            </span>
            <span className="cf-toast__msg">{t.message}</span>
            <button
              type="button"
              className="cf-toast__close"
              onClick={() => dismiss(t.id)}
              aria-label="Fermer"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
