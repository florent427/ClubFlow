import { useCallback, useSyncExternalStore } from 'react';

/**
 * Point de rupture unique du shell admin. En dessous, l'application passe en
 * mode mobile : barre d'onglets en bas, navigation en feuille plein écran,
 * tiroirs et modales en feuilles, listes en cartes à la place des tableaux.
 *
 * `mobile.css` utilise la même valeur — les deux doivent rester alignées,
 * sinon le JSX rend la barre d'onglets pendant que le CSS la cache (ou
 * l'inverse).
 */
export const MOBILE_MEDIA_QUERY = '(max-width: 899.98px)';

function canMatch(): boolean {
  return (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  );
}

/**
 * Abonnement réactif à une media query.
 *
 * Rend `false` côté serveur et dans les environnements sans `matchMedia`
 * (jsdom nu), l'état réel de la fenêtre sinon, et se met à jour quand elle
 * change de taille ou d'orientation.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!canMatch()) return () => {};
      const mql = window.matchMedia(query);
      // Safari < 14 n'expose que la paire addListener/removeListener.
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
      }
      mql.addListener(onChange);
      return () => mql.removeListener(onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(
    () => (canMatch() ? window.matchMedia(query).matches : false),
    [query],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** Vrai sous 900px : l'admin est rendu en mode mobile. */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_MEDIA_QUERY);
}
