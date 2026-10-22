import { useCallback, useEffect, useRef, useState } from 'react';

const DEBOUNCE_MS = 300;
const MIN_CHARS = 3;

/**
 * Suggestions d'une API publique d'autocomplétion (adresse IGN, communes
 * geo.api.gouv.fr) : anti-rebond de 300 ms, 3 caractères minimum, requête
 * précédente annulée. Une panne réseau ne bloque rien : la saisie libre
 * reste toujours possible, on n'affiche simplement pas de suggestion.
 */
export function useGeoSuggestions<T>(
  query: string,
  buildUrl: (q: string) => string,
  map: (json: unknown) => T[],
  enabled: boolean,
): { items: T[]; loading: boolean; clear: () => void; skipNext: (pickedValue: string) => void } {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  // Après un choix dans la liste, le champ reçoit la valeur choisie : on
  // ne relance pas une recherche sur ce texte.
  const skipRef = useRef<string | null>(null);
  const buildRef = useRef(buildUrl);
  const mapRef = useRef(map);
  buildRef.current = buildUrl;
  mapRef.current = map;

  useEffect(() => {
    const skipped = skipRef.current;
    skipRef.current = null;
    if (skipped !== null && skipped === query) {
      setItems([]);
      setLoading(false);
      return;
    }
    const q = query.trim();
    if (!enabled || q.length < MIN_CHARS) {
      setItems([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(buildRef.current(q), { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : null))
        .then((json: unknown) => {
          if (!controller.signal.aborted) setItems(mapRef.current(json));
        })
        .catch(() => {
          if (!controller.signal.aborted) setItems([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, enabled]);

  const clear = useCallback(() => {
    setItems([]);
    setLoading(false);
  }, []);
  const skipNext = useCallback((pickedValue: string) => {
    skipRef.current = pickedValue;
  }, []);

  return { items, loading, clear, skipNext };
}
