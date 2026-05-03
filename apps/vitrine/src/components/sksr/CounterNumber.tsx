'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  /** Valeur cible à atteindre. */
  target: number;
  /** Durée en ms de l'animation. */
  duration?: number;
  /** Classe CSS du conteneur. */
  className?: string;
  /**
   * Format : 'integer' → arrondi entier, 'locale' → `toLocaleString('fr-FR')`
   * (utile pour les milliers).
   */
  format?: 'integer' | 'locale';
  /**
   * Seuil de déclenchement (0..1). Défaut 0.5.
   */
  threshold?: number;
}

/**
 * Nombre animé au scroll (ease-out cubic sur 2s par défaut). Port fidèle de
 * l'animation SKSR `[data-counter]`.
 */
export function CounterNumber({
  target,
  duration = 2000,
  className,
  format = 'integer',
  threshold = 0.5,
}: Props) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [value, setValue] = useState(0);
  const triggered = useRef(false);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !triggered.current) {
            triggered.current = true;
            const start = performance.now();
            const tick = (now: number) => {
              const p = Math.min(1, (now - start) / duration);
              const ease = 1 - Math.pow(1 - p, 3);
              setValue(Math.round(target * ease));
              if (p < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
            io.unobserve(e.target);
          }
        });
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [target, duration, threshold]);

  const formatted =
    format === 'locale' ? value.toLocaleString('fr-FR') : String(value);
  return (
    <span ref={ref} className={className}>
      {formatted}
    </span>
  );
}
