import { useEffect, useState } from 'react';

/**
 * Suggestions d'un référentiel public, interrogé après une pause de frappe.
 * Une requête dépassée est annulée : sans ça, une réponse lente à « sai »
 * pourrait écraser celle de « saint-pi ».
 */
export function useSuggestions<T>(
  query: string,
  enabled: boolean,
  fetcher: (q: string, signal: AbortSignal) => Promise<T[]>,
  minLength = 3,
): T[] {
  const [items, setItems] = useState<T[]>([]);
  const q = query.trim();
  useEffect(() => {
    if (!enabled || q.length < minLength) {
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      fetcher(q, ctrl.signal)
        .then(setItems)
        // Référentiel indisponible : la saisie libre reste possible.
        .catch(() => setItems([]));
    }, 250);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, enabled, fetcher, minLength]);
  return items;
}
