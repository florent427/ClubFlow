import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@apollo/client/react';
import { apolloClient } from '../lib/apollo';
import { MY_ADMIN_CLUBS } from '../lib/documents';
import type { MyAdminClubsQueryData, MyAdminClub } from '../lib/types';
import { getClubId, setActiveClub, isLoggedIn } from '../lib/storage';

/**
 * Bouton + dropdown affichant le club courant et permettant de switcher
 * vers un autre club accessible. Inséré dans le header AdminLayout.
 *
 * - 1 seul club → label cliquable mais sans dropdown (pas de friction)
 * - N clubs → dropdown listant tous les clubs + lien "Créer un nouveau club"
 *
 * Switch = setActiveClub + window.location.assign('/') pour reset complet
 * du cache Apollo (évite des fuites de données entre clubs).
 */
export function ClubSwitcher() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  const { data, loading } = useQuery<MyAdminClubsQueryData>(MY_ADMIN_CLUBS, {
    skip: !isLoggedIn(),
    fetchPolicy: 'cache-and-network',
  });
  const clubs = data?.myAdminClubs ?? [];
  const currentId = getClubId();
  const current = clubs.find((c) => c.id === currentId) ?? null;

  // Fermer le dropdown sur click outside
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  // Si on a perdu la sélection (clubId stale), envoyer sur /select-club
  useEffect(() => {
    if (loading) return;
    if (clubs.length > 0 && currentId && !current) {
      // clubId localStorage ne correspond à aucun club accessible : redirect
      void navigate('/select-club', { replace: true });
    }
  }, [clubs, loading, currentId, current, navigate]);

  if (!isLoggedIn() || loading) {
    return null;
  }

  function pickClub(club: MyAdminClub) {
    if (club.id === currentId) {
      setOpen(false);
      return;
    }
    setActiveClub(club.id, club.slug);
    setOpen(false);
    // Reset complet du cache Apollo + reload pour repartir propre sur le nouveau club
    void apolloClient.clearStore().then(() => {
      window.location.assign('/');
    });
  }

  // Pas de club accessible : message minimal
  if (clubs.length === 0) {
    return (
      <div className="cf-club-switcher">
        <span className="cf-club-switcher__empty">Aucun club accessible</span>
      </div>
    );
  }

  // 1 seul club : label statique (pas de dropdown)
  if (clubs.length === 1 && current) {
    return (
      <div className="cf-club-switcher cf-club-switcher--solo">
        <Avatar club={current} />
        <span className="cf-club-switcher__name" title={current.name}>
          {current.name}
        </span>
        <SwitcherStyles />
      </div>
    );
  }

  // N clubs : dropdown
  return (
    <div className="cf-club-switcher" ref={ref}>
      <button
        type="button"
        className="cf-club-switcher__btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Changer de club"
      >
        {current ? (
          <>
            <Avatar club={current} />
            <span className="cf-club-switcher__name">{current.name}</span>
          </>
        ) : (
          <span className="cf-club-switcher__name">Choisir un club…</span>
        )}
        <span className="cf-club-switcher__chevron" aria-hidden>
          ▾
        </span>
      </button>

      {open ? (
        <div className="cf-club-switcher__menu" role="listbox">
          <p className="cf-club-switcher__menu-label">Mes clubs</p>
          <ul>
            {clubs.map((club) => (
              <li key={club.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={club.id === currentId}
                  className={`cf-club-switcher__option${club.id === currentId ? ' is-active' : ''}`}
                  onClick={() => pickClub(club)}
                >
                  <Avatar club={club} />
                  <span className="cf-club-switcher__option-body">
                    <span className="cf-club-switcher__option-name">
                      {club.name}
                    </span>
                    <span className="cf-club-switcher__option-meta">
                      {club.viaSuperAdmin
                        ? 'SUPER_ADMIN'
                        : club.role === 'CLUB_ADMIN'
                          ? 'Administrateur'
                          : club.role}
                    </span>
                  </span>
                  {club.id === currentId ? (
                    <span aria-hidden>✓</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          <div className="cf-club-switcher__footer">
            <a
              href="/signup"
              className="cf-club-switcher__create"
              target="_blank"
              rel="noopener noreferrer"
            >
              + Créer un nouveau club
            </a>
          </div>
        </div>
      ) : null}

      <SwitcherStyles />
    </div>
  );
}

function Avatar({ club }: { club: MyAdminClub }) {
  return (
    <span className="cf-club-switcher__avatar" aria-hidden>
      {club.logoUrl ? (
        <img src={club.logoUrl} alt="" />
      ) : (
        club.name.slice(0, 2).toUpperCase()
      )}
    </span>
  );
}

function SwitcherStyles() {
  return (
    <style>{`
      .cf-club-switcher {
        position: relative;
        display: inline-flex;
        align-items: center;
      }
      .cf-club-switcher--solo {
        gap: 0.5rem;
        padding: 0.4rem 0.6rem;
        border: 1px solid var(--color-border, #2a2a30);
        border-radius: 8px;
        font-size: 0.875rem;
        max-width: 220px;
      }
      .cf-club-switcher__empty {
        font-size: 0.85rem;
        color: var(--color-text-muted, #9090a0);
        font-style: italic;
      }
      .cf-club-switcher__btn {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.4rem 0.6rem;
        background: transparent;
        border: 1px solid var(--color-border, #2a2a30);
        border-radius: 8px;
        color: inherit;
        font: inherit;
        font-size: 0.875rem;
        cursor: pointer;
        max-width: 240px;
      }
      .cf-club-switcher__btn:hover {
        border-color: var(--color-primary, #d4af37);
      }
      .cf-club-switcher__avatar {
        width: 24px;
        height: 24px;
        border-radius: 5px;
        background: var(--color-primary, #d4af37);
        color: #000;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 0.65rem;
        overflow: hidden;
        flex-shrink: 0;
      }
      .cf-club-switcher__avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .cf-club-switcher__name {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 160px;
      }
      .cf-club-switcher__chevron {
        opacity: 0.6;
        font-size: 0.7rem;
      }
      .cf-club-switcher__menu {
        position: absolute;
        top: calc(100% + 0.5rem);
        left: 0;
        min-width: 280px;
        max-width: 360px;
        background: var(--color-bg-elevated, #15151a);
        border: 1px solid var(--color-border, #2a2a30);
        border-radius: 10px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
        z-index: 100;
        overflow: hidden;
      }
      .cf-club-switcher__menu-label {
        margin: 0;
        padding: 0.5rem 0.75rem 0.25rem;
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--color-text-muted, #9090a0);
      }
      .cf-club-switcher__menu ul {
        list-style: none;
        padding: 0;
        margin: 0;
        max-height: 320px;
        overflow-y: auto;
      }
      .cf-club-switcher__option {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        width: 100%;
        padding: 0.55rem 0.75rem;
        background: transparent;
        border: 0;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }
      .cf-club-switcher__option:hover {
        background: rgba(212, 175, 55, 0.08);
      }
      .cf-club-switcher__option.is-active {
        background: rgba(212, 175, 55, 0.12);
      }
      .cf-club-switcher__option-body {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        min-width: 0;
      }
      .cf-club-switcher__option-name {
        font-size: 0.875rem;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .cf-club-switcher__option-meta {
        font-size: 0.7rem;
        color: var(--color-text-muted, #9090a0);
      }
      .cf-club-switcher__footer {
        padding: 0.5rem 0.75rem;
        border-top: 1px solid var(--color-border, #2a2a30);
      }
      .cf-club-switcher__create {
        display: block;
        font-size: 0.85rem;
        color: var(--color-primary, #d4af37);
        text-decoration: none;
      }
      .cf-club-switcher__create:hover { text-decoration: underline; }
    `}</style>
  );
}
