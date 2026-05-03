import { useQuery } from '@apollo/client/react';
import { NavLink, Outlet, useParams } from 'react-router-dom';
import { PUBLIC_CLUB } from '../../lib/public-documents';
import type { PublicClubQueryData } from '../../lib/public-types';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `ps-nav-link${isActive ? ' ps-nav-link--active' : ''}`;

export function PublicSiteLayout() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { data, loading, error } = useQuery<PublicClubQueryData>(PUBLIC_CLUB, {
    variables: { slug },
    fetchPolicy: 'cache-and-network',
  });

  const club = data?.publicClub;
  const base = `/site/${slug}`;

  if (loading && !club) {
    return (
      <div className="ps-shell">
        <p className="ps-loading">Chargement…</p>
      </div>
    );
  }
  if (error || !club) {
    return (
      <div className="ps-shell">
        <div className="ps-error">
          <h1>Club introuvable</h1>
          <p>L’adresse que vous avez saisie ne correspond à aucun club.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ps-shell">
      <header className="ps-header">
        <div className="ps-header__inner">
          <NavLink to={base} end className="ps-brand">
            {club.name}
          </NavLink>
          <nav className="ps-nav" aria-label="Navigation principale">
            <NavLink to={base} end className={linkClass}>
              Accueil
            </NavLink>
            <NavLink to={`${base}/actus`} className={linkClass}>
              Actualités
            </NavLink>
            <NavLink to={`${base}/evenements`} className={linkClass}>
              Événements
            </NavLink>
            <NavLink to={`${base}/blog`} className={linkClass}>
              Blog
            </NavLink>
            <NavLink to={`${base}/boutique`} className={linkClass}>
              Boutique
            </NavLink>
          </nav>
          <a href="/login" className="ps-login">
            Espace membre
          </a>
        </div>
      </header>
      <main className="ps-main">
        <Outlet context={{ slug, clubName: club.name }} />
      </main>
      <footer className="ps-footer">
        <span>© {new Date().getFullYear()} {club.name}</span>
        <span className="ps-footer__muted">Propulsé par ClubFlow</span>
      </footer>
    </div>
  );
}
