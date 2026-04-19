import { useLazyQuery } from '@apollo/client/react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CLUB_SEARCH } from '../lib/documents';
import type { ClubSearchQueryData } from '../lib/types';

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

export function GlobalSearchBar() {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [run, { data, loading }] = useLazyQuery<ClubSearchQueryData>(
    CLUB_SEARCH,
    { fetchPolicy: 'network-only' },
  );

  useEffect(() => {
    const term = value.trim();
    if (term.length < 2) {
      setOpen(false);
      return;
    }
    const h = setTimeout(() => {
      void run({ variables: { q: term } });
      setOpen(true);
    }, 220);
    return () => clearTimeout(h);
  }, [value, run]);

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

  const r = data?.clubSearch;
  const total =
    (r?.members.length ?? 0) +
    (r?.contacts.length ?? 0) +
    (r?.events.length ?? 0) +
    (r?.blogPosts.length ?? 0) +
    (r?.announcements.length ?? 0);

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
          if (value.trim().length >= 2) setOpen(true);
        }}
      />
      {open ? (
        <div className="cf-gs__panel" role="listbox">
          {loading ? (
            <p className="cf-gs__status">Recherche…</p>
          ) : total === 0 ? (
            <p className="cf-gs__status">Aucun résultat.</p>
          ) : (
            <>
              {r && r.members.length > 0 ? (
                <div className="cf-gs__group">
                  <p className="cf-gs__group-title">Membres</p>
                  {r.members.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="cf-gs__item"
                      onClick={() => go('/members')}
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
              {r && r.contacts.length > 0 ? (
                <div className="cf-gs__group">
                  <p className="cf-gs__group-title">Contacts</p>
                  {r.contacts.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="cf-gs__item"
                      onClick={() => go('/members/contacts')}
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
              {r && r.events.length > 0 ? (
                <div className="cf-gs__group">
                  <p className="cf-gs__group-title">Événements</p>
                  {r.events.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      className="cf-gs__item"
                      onClick={() => go('/evenements')}
                    >
                      <span className="material-symbols-outlined" aria-hidden>
                        event
                      </span>
                      <span className="cf-gs__item-main">{e.title}</span>
                      <span className="cf-gs__item-meta">
                        {formatDate(e.startsAt)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
              {r && r.blogPosts.length > 0 ? (
                <div className="cf-gs__group">
                  <p className="cf-gs__group-title">Articles</p>
                  {r.blogPosts.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      className="cf-gs__item"
                      onClick={() => go('/blog')}
                    >
                      <span className="material-symbols-outlined" aria-hidden>
                        article
                      </span>
                      <span className="cf-gs__item-main">{b.title}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {r && r.announcements.length > 0 ? (
                <div className="cf-gs__group">
                  <p className="cf-gs__group-title">Annonces</p>
                  {r.announcements.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className="cf-gs__item"
                      onClick={() => go('/vie-club')}
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
          )}
        </div>
      ) : null}
    </div>
  );
}
