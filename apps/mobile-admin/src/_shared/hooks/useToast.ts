import { useCallback, useEffect, useRef, useState } from 'react';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export type ToastMessage = {
  id: string;
  text: string;
  tone: ToastTone;
};

type ToastShowFn = (text: string, tone?: ToastTone, durationMs?: number) => void;

/**
 * Hook léger pour gérer un toast unique (pas de stack en v1).
 * Le composant ToastBanner (à intégrer en haut de l'app) lit `current`
 * et l'affiche pendant la durée demandée.
 */
export function useToast(): {
  current: ToastMessage | null;
  show: ToastShowFn;
  dismiss: () => void;
} {
  const [current, setCurrent] = useState<ToastMessage | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setCurrent(null);
  }, []);

  const show = useCallback<ToastShowFn>(
    (text, tone = 'info', durationMs = 3000) => {
      const id = `${Date.now()}-${Math.random()}`;
      setCurrent({ id, text, tone });
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setCurrent(null);
        timerRef.current = null;
      }, durationMs);
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { current, show, dismiss };
}
