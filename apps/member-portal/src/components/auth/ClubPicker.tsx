import { useLazyQuery } from '@apollo/client/react';
import { useEffect, useRef, useState } from 'react';
import { SEARCH_PUBLIC_CLUBS } from '../../lib/documents';

type PublicClub = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  tagline: string | null;
};

interface Props {
  /** Callback quand un club est choisi (parent gère ensuite la navigation). */
  onSelect: (club: PublicClub) => void;
  /** Texte du header optionnel (ex: "Quel club rejoignez-vous ?"). */
  title?: string;
  /** Texte d'aide sous le champ. */
  hint?: string;
}

/**
 * Sélecteur public de club avec autocomplete (parité mobile
 * SelectClubScreen). Utilisé sur les pages /register et /login portail
 * quand l'URL n'a pas de `?club=<slug>` pré-rempli.
 *
 * - Debounce 250 ms pour éviter de bombarder l'API
 * - Empty/loading/found states soignés
 * - Sélection → callback parent (qui peut nav vers /register?club=…)
 */
export function ClubPicker({
  onSelect,
  title = 'Quel est votre club ?',
  hint = 'Tapez le nom ou le code de votre club.',
}: Props) {
  const [query, setQuery] = useState('');
  const [search, { data, loading }] = useLazyQuery<{
    searchPublicClubs: PublicClub[];
  }>(SEARCH_PUBLIC_CLUBS, { fetchPolicy: 'network-only' });

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (query.trim().length < 2) return;
    timeoutRef.current = setTimeout(() => {
      void search({ variables: { query: query.trim() } });
    }, 250);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [query, search]);

  const results = data?.searchPublicClubs ?? [];

  return (
    <div className="club-picker">
      <h2 className="club-picker__title">{title}</h2>
      <p className="club-picker__hint">{hint}</p>
      <input
        type="search"
        className="club-picker__search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ex. Shotokan Karaté Sud Réunion"
        autoFocus
        autoComplete="off"
      />
      {query.trim().length < 2 ? (
        <p className="club-picker__empty">
          Saisissez au moins 2 lettres pour rechercher.
        </p>
      ) : loading ? (
        <p className="club-picker__empty">Recherche…</p>
      ) : results.length === 0 ? (
        <p className="club-picker__empty">
          Aucun club trouvé. Vérifiez l'orthographe ou demandez le nom
          exact à votre dirigeant.
        </p>
      ) : (
        <ul className="club-picker__list">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="club-picker__item"
                onClick={() => onSelect(c)}
              >
                {c.logoUrl ? (
                  <img
                    src={c.logoUrl}
                    alt=""
                    className="club-picker__logo"
                  />
                ) : (
                  <span
                    className="club-picker__logo club-picker__logo--initials"
                    aria-hidden="true"
                  >
                    {c.name
                      .split(/\s+/)
                      .map((w) => w[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                )}
                <span className="club-picker__name">
                  <strong>{c.name}</strong>
                  {c.tagline ? (
                    <small>{c.tagline}</small>
                  ) : null}
                </span>
                <span
                  className="material-symbols-outlined club-picker__chevron"
                  aria-hidden="true"
                >
                  chevron_right
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
