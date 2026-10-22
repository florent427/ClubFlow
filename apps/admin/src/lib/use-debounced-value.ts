import { useEffect, useState } from 'react';

/**
 * Rend `value` une fois qu'il n'a plus changé depuis `delayMs`. Sert aux
 * champs de recherche envoyés à l'API : une requête par pause de frappe, pas
 * une par touche.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
