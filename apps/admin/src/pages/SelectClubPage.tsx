import { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@apollo/client/react';
import { MY_ADMIN_CLUBS } from '../lib/documents';
import type { MyAdminClubsQueryData, MyAdminClub } from '../lib/types';
import {
  isLoggedIn,
  getClubId,
  setActiveClub,
} from '../lib/storage';

/**
 * Page de sélection de club après login.
 *
 * Stratégie :
 * - 0 club accessible → message d'erreur (compte sans accès)
 * - 1 club → auto-redirect immédiat (pas de friction)
 * - N clubs → afficher la liste, click → setActiveClub + redirect
 *
 * Accédée :
 * - Après login si l'utilisateur a >1 club
 * - Manuellement via le ClubSwitcher si l'utilisateur veut changer
 * - Auto-fallback si l'API renvoie FORBIDDEN sur un clubId stale
 */
export function SelectClubPage() {
  const navigate = useNavigate();
  const { data, loading, error } = useQuery<MyAdminClubsQueryData>(
    MY_ADMIN_CLUBS,
    { skip: !isLoggedIn(), fetchPolicy: 'network-only' },
  );

  const clubs = data?.myAdminClubs ?? [];

  // Auto-redirect si 1 seul club
  useEffect(() => {
    if (loading || error) return;
    if (clubs.length === 1) {
      const c = clubs[0];
      setActiveClub(c.id, c.slug);
      void navigate('/', { replace: true });
    }
  }, [clubs, loading, error, navigate]);

  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />;
  }

  function pick(club: MyAdminClub) {
    setActiveClub(club.id, club.slug);
    void navigate('/', { replace: true });
  }

  return (
    <div className="select-club-page">
      <div className="select-club-card">
        <header className="select-club-header">
          <p className="select-club-eyebrow">ClubFlow</p>
          <h1>Choisissez un club</h1>
          <p className="select-club-sub">
            Vous avez accès à plusieurs clubs. Sélectionnez celui que vous
            souhaitez administrer.
          </p>
        </header>

        {loading ? (
          <p className="select-club-status">Chargement de vos clubs…</p>
        ) : error ? (
          <p className="select-club-status select-club-error">
            Impossible de charger vos clubs : {error.message}
          </p>
        ) : clubs.length === 0 ? (
          <div className="select-club-empty">
            <p>
              Votre compte n'a accès à aucun club pour le moment. Si vous venez
              de vous inscrire, vérifiez que votre email a bien été confirmé.
            </p>
            <p>
              <a href="/signup" className="btn btn-secondary">
                Créer un nouveau club
              </a>
            </p>
          </div>
        ) : (
          <ul className="select-club-list">
            {clubs.map((club) => {
              const active = club.id === getClubId();
              return (
                <li key={club.id}>
                  <button
                    type="button"
                    className={`select-club-item${active ? ' is-active' : ''}`}
                    onClick={() => pick(club)}
                  >
                    <span className="select-club-item__avatar">
                      {club.logoUrl ? (
                        <img src={club.logoUrl} alt="" />
                      ) : (
                        club.name.slice(0, 2).toUpperCase()
                      )}
                    </span>
                    <span className="select-club-item__body">
                      <span className="select-club-item__name">{club.name}</span>
                      <span className="select-club-item__meta">
                        {club.viaSuperAdmin
                          ? 'Vue système (SUPER_ADMIN)'
                          : club.role === 'CLUB_ADMIN'
                            ? 'Administrateur'
                            : club.role}
                        {' · '}
                        <span className="select-club-item__slug">
                          {club.slug}
                        </span>
                      </span>
                    </span>
                    {active ? (
                      <span className="select-club-item__check">✓</span>
                    ) : (
                      <span className="select-club-item__chevron">›</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p className="select-club-hint">
          Pour créer un nouveau club, allez sur la{' '}
          <a href="/signup">page de création publique</a>.
        </p>
      </div>

      <style>{`
        .select-club-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem 1rem;
          background: var(--color-bg, #0a0a0a);
        }
        .select-club-card {
          width: 100%;
          max-width: 480px;
          background: var(--color-bg-elevated, #15151a);
          border: 1px solid var(--color-border, #2a2a30);
          border-radius: 16px;
          padding: 2.5rem 2rem;
          color: var(--color-text, #e5e5e7);
        }
        .select-club-header { margin-bottom: 2rem; }
        .select-club-eyebrow {
          font-size: 0.75rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--color-primary, #d4af37);
          margin: 0 0 0.5rem;
        }
        .select-club-header h1 {
          font-size: 1.75rem;
          margin: 0 0 0.5rem;
        }
        .select-club-sub {
          color: var(--color-text-muted, #9090a0);
          margin: 0;
          font-size: 0.95rem;
        }
        .select-club-status {
          padding: 1rem;
          text-align: center;
          color: var(--color-text-muted, #9090a0);
        }
        .select-club-error { color: #ef4444; }
        .select-club-empty {
          padding: 1rem 0;
          color: var(--color-text-muted, #9090a0);
        }
        .select-club-empty p { margin: 0 0 1rem; }
        .select-club-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .select-club-item {
          display: flex;
          align-items: center;
          gap: 0.875rem;
          width: 100%;
          padding: 0.875rem 1rem;
          background: transparent;
          border: 1px solid var(--color-border, #2a2a30);
          border-radius: 10px;
          color: inherit;
          font: inherit;
          text-align: left;
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
        }
        .select-club-item:hover {
          background: rgba(212, 175, 55, 0.05);
          border-color: var(--color-primary, #d4af37);
        }
        .select-club-item.is-active {
          background: rgba(212, 175, 55, 0.1);
          border-color: var(--color-primary, #d4af37);
        }
        .select-club-item__avatar {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          background: var(--color-primary, #d4af37);
          color: #000;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.9rem;
          overflow: hidden;
          flex-shrink: 0;
        }
        .select-club-item__avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .select-club-item__body {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
          min-width: 0;
        }
        .select-club-item__name {
          font-weight: 600;
          font-size: 0.95rem;
        }
        .select-club-item__meta {
          font-size: 0.8rem;
          color: var(--color-text-muted, #9090a0);
        }
        .select-club-item__slug {
          font-family: ui-monospace, monospace;
          font-size: 0.75rem;
        }
        .select-club-item__check,
        .select-club-item__chevron {
          font-size: 1.25rem;
          color: var(--color-primary, #d4af37);
        }
        .select-club-item__chevron {
          color: var(--color-text-muted, #9090a0);
        }
        .select-club-hint {
          margin: 1.5rem 0 0;
          padding-top: 1.5rem;
          border-top: 1px solid var(--color-border, #2a2a30);
          font-size: 0.85rem;
          color: var(--color-text-muted, #9090a0);
        }
        .select-club-hint a {
          color: var(--color-primary, #d4af37);
        }
      `}</style>
    </div>
  );
}
