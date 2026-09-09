import { useLazyQuery } from '@apollo/client/react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CLUB_SEARCH } from '../lib/documents';
import type { ClubSearchQueryData } from '../lib/types';

const MIN_TERM_LENGTH = 2;
const DEBOUNCE_MS = 220;

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
    });
  } catch {
    return '';
  }
}

type SearchResult = ClubSearchQueryData['clubSearch'];

/**
 * Recherche différée : la requête ne part qu'après une pause de frappe et
 * seulement à partir de deux caractères. `busy` couvre aussi la fenêtre de
 * temporisation, pour que l'interface n'affiche jamais « Aucun résultat »
 * avant d'avoir réellement cherché le terme courant.
 */
function useClubSearch(value: string): {
  ready: boolean;
  busy: boolean;
  result: SearchResult | undefined;
} {
  const term = value.trim();
  const ready = term.length >= MIN_TERM_LENGTH;
  const [ranTerm, setRanTerm] = useState('');
  const [run, { data, loading }] = useLazyQuery<ClubSearchQueryData>(
    CLUB_SEARCH,
    { fetchPolicy: 'network-only' },
  );

  useEffect(() => {
    if (!ready) return;
    const h = setTimeout(() => {
      setRanTerm(term);
      void run({ variables: { q: term } });
    }, DEBOUNCE_MS);
    return () => clearTimeout(h);
  }, [term, ready, run]);

  const current = ready && ranTerm === term;
  return {
    ready,
    busy: ready && (!current || loading),
    result: current ? data?.clubSearch : undefined,
  };
}

/** Groupes de résultats, partagés entre la liste déroulante et la feuille. */
function SearchResults({
  result,
  busy,
  onGo,
}: {
  result: SearchResult | undefined;
  busy: boolean;
  onGo: (to: string) => void;
}) {
  if (busy) return <p className="cf-gs__status">Recherche…</p>;
  const r = result;
  const total = r
    ? r.members.length +
      r.contacts.length +
      r.events.length +
      r.blogPosts.length +
      r.announcements.length
    : 0;
  if (!r || total === 0) {
    return <p className="cf-gs__status">Aucun résultat.</p>;
  }
  return (
    <>
      {r.members.length > 0 ? (
        <div className="cf-gs__group">
          <p className="cf-gs__group-title">Membres</p>
          {r.members.map((m) => (
            <button
              key={m.id}
              type="button"
              className="cf-gs__item"
              onClick={() => onGo('/members')}
            >
              <span className="material-symbols-outlined" aria-hidden>
                person
              </span>
              <span className="cf-gs__item-main">
                {m.firstName} {m.lastName}
              </span>
              {m.email ? (
                <span className="cf-gs__item-meta">{m.email}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
      {r.contacts.length > 0 ? (
        <div className="cf-gs__group">
          <p className="cf-gs__group-title">Contacts</p>
          {r.contacts.map((c) => (
            <button
              key={c.id}
              type="button"
              className="cf-gs__item"
              onClick={() => onGo('/contacts')}
            >
              <span className="material-symbols-outlined" aria-hidden>
                badge
              </span>
              <span className="cf-gs__item-main">
                {c.firstName} {c.lastName}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {r.events.length > 0 ? (
        <div className="cf-gs__group">
          <p className="cf-gs__group-title">Événements</p>
          {r.events.map((e) => (
            <button
              key={e.id}
              type="button"
              className="cf-gs__item"
              onClick={() => onGo('/evenements')}
            >
              <span className="material-symbols-outlined" aria-hidden>
                event
              </span>
              <span className="cf-gs__item-main">{e.title}</span>
              <span className="cf-gs__item-meta">{formatDate(e.startsAt)}</span>
            </button>
          ))}
        </div>
      ) : null}
      {r.blogPosts.length > 0 ? (
        <div className="cf-gs__group">
          <p className="cf-gs__group-title">Articles</p>
          {r.blogPosts.map((b) => (
            <button
              key={b.id}
              type="button"
              className="cf-gs__item"
              onClick={() => onGo('/blog')}
            >
              <span className="material-symbols-outlined" aria-hidden>
                article
              </span>
              <span className="cf-gs__item-main">{b.title}</span>
            </button>
          ))}
        </div>
      ) : null}
      {r.announcements.length > 0 ? (
        <div className="cf-gs__group">
          <p className="cf-gs__group-title">Annonces</p>
          {r.announcements.map((a) => (
            <button
              key={a.id}
              type="button"
              className="cf-gs__item"
              onClick={() => onGo('/vie-du-club')}
            >
              <span className="material-symbols-outlined" aria-hidden>
                campaign
              </span>
              <span className="cf-gs__item-main">{a.title}</span>
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

/** Desktop : champ dans la top-bar, résultats en liste déroulante. */
function InlineSearch() {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { ready, busy, result } = useClubSearch(value);

  useEffect(() => {
    setOpen(ready);
  }, [ready]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function go(to: string) {
    setOpen(false);
    setValue('');
    navigate(to);
  }

  return (
    <div className="cf-topbar__search cf-gs" ref={wrapRef}>
      <span
        className="material-symbols-outlined cf-topbar__search-icon"
        aria-hidden
      >
        search
      </span>
      <input
        type="search"
        placeholder="Rechercher un membre, un événement, un article…"
        className="cf-topbar__input"
        aria-label="Recherche globale"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => {
          if (ready) setOpen(true);
        }}
      />
      {open ? (
        <div className="cf-gs__panel" role="listbox">
          <SearchResults result={result} busy={busy} onGo={go} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Mobile : un bouton loupe dans la top-bar ouvre une feuille plein écran
 * avec le champ (focus immédiat, clavier « rechercher ») et les résultats en
 * liste tactile. Échap ou la flèche retour la referment ; toute navigation
 * aussi.
 */
function SheetSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const { ready, busy, result } = useClubSearch(value);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('cf-scroll-lock');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('cf-scroll-lock');
    };
  }, [open]);

  function go(to: string) {
    setOpen(false);
    setValue('');
    navigate(to);
  }

  return (
    <>
      <button
        type="button"
        className="cf-gs__sheet-btn"
        aria-label="Rechercher"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="material-symbols-outlined" aria-hidden>
          search
        </span>
      </button>
      {open ? (
        <div
          className="cf-gs-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Recherche globale"
        >
          <div className="cf-gs-sheet__bar">
            <button
              type="button"
              className="cf-gs-sheet__back"
              aria-label="Fermer la recherche"
              onClick={() => setOpen(false)}
            >
              <span className="material-symbols-outlined" aria-hidden>
                arrow_back
              </span>
            </button>
            <div className="cf-gs-sheet__field">
              <span
                className="material-symbols-outlined cf-topbar__search-icon"
                aria-hidden
              >
                search
              </span>
              <input
                type="search"
                className="cf-gs-sheet__input"
                placeholder="Membre, événement, article…"
                aria-label="Recherche globale"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
                autoComplete="off"
                enterKeyHint="search"
              />
            </div>
          </div>
          <div className="cf-gs-sheet__results">
            {ready ? (
              <SearchResults result={result} busy={busy} onGo={go} />
            ) : (
              <p className="cf-gs__status">
                Tapez au moins deux caractères pour chercher un membre, un
                contact, un événement ou un article.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

export function GlobalSearchBar({
  variant = 'inline',
}: {
  /** `sheet` = mobile : bouton loupe + feuille plein écran. */
  variant?: 'inline' | 'sheet';
}) {
  return variant === 'sheet' ? <SheetSearch /> : <InlineSearch />;
}
