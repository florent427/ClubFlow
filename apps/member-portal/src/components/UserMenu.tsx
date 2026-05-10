import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@apollo/client/react';
import { navigateToAdminApp } from '../lib/admin-switch';
import {
  SELECT_VIEWER_CONTACT_PROFILE,
  SELECT_VIEWER_PROFILE,
} from '../lib/documents';
import {
  clearAuth,
  clearClubId,
  getClubId,
  getToken,
  setMemberSession,
} from '../lib/storage';
import type {
  SelectContactProfileData,
  SelectProfileData,
  ViewerProfile,
} from '../lib/auth-types';

interface Props {
  /** Profil actif (header user info). */
  me: {
    firstName: string | null | undefined;
    lastName: string | null | undefined;
    email: string | null | undefined;
  } | null;
  /** Nom du club courant (affiché en sub-header). */
  clubName: string | null;
  /** Profils du foyer + autres clubs auxquels le user est rattaché. */
  profiles: ViewerProfile[];
  /** L'utilisateur a-t-il accès admin sur le CLUB COURANT (pas un autre) ? */
  canAdminCurrentClub: boolean;
  /** ClubId courant — utilisé pour le SSO cross-domain. */
  currentClubId: string | null;
}

function profileRowKey(p: ViewerProfile): string {
  if (p.memberId) return `m:${p.memberId}`;
  if (p.contactId) return `c:${p.contactId}`;
  return '';
}

/**
 * Menu utilisateur compact (avatar dropdown) qui regroupe toutes les
 * actions secondaires de la top bar : switch profil foyer, accès admin
 * (si admin du club courant), paramètres, déconnexion.
 *
 * Évite la prolifération d'icônes standalone qui devient illisible
 * avec un foyer à 5+ membres ou plusieurs clubs.
 */
export function UserMenu({
  me,
  clubName,
  profiles,
  canAdminCurrentClub,
  currentClubId,
}: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Click outside ferme le dropdown.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Esc ferme le dropdown.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const [selectMember, { loading: switchingMember }] =
    useMutation<SelectProfileData>(SELECT_VIEWER_PROFILE);
  const [selectContact, { loading: switchingContact }] =
    useMutation<SelectContactProfileData>(SELECT_VIEWER_CONTACT_PROFILE);
  const switching = switchingMember || switchingContact;

  async function switchToProfile(p: ViewerProfile) {
    if (switching) return;
    if (p.memberId) {
      const { data } = await selectMember({
        variables: { memberId: p.memberId },
      });
      const tok = data?.selectActiveViewerProfile?.accessToken;
      if (!tok) return;
      setMemberSession(tok, p.clubId);
    } else if (p.contactId) {
      const { data } = await selectContact({
        variables: { contactId: p.contactId },
      });
      const tok = data?.selectActiveViewerContactProfile?.accessToken;
      if (!tok) return;
      setMemberSession(tok, p.clubId);
    } else {
      return;
    }
    setOpen(false);
    void navigate('/', { replace: true });
    window.location.reload();
  }

  function handleAdmin() {
    const tok = getToken();
    const cid = currentClubId ?? getClubId();
    if (!tok || !cid) return;
    setOpen(false);
    // Le SSO cross-domain passe le token + clubId via URL hash que
    // l'admin parse au boot (cf. apps/admin/App.tsx). Sans ça,
    // localStorage portail≠admin (cross-subdomain) et le user arrive
    // déconnecté.
    navigateToAdminApp(tok, cid);
  }

  function handleChangeProfile() {
    setOpen(false);
    clearClubId();
    void navigate('/select-profile', { replace: true });
  }

  function handleSettings() {
    setOpen(false);
    void navigate('/parametres');
  }

  function handleLogout() {
    setOpen(false);
    clearAuth();
    void navigate('/login', { replace: true });
  }

  const initials = `${(me?.firstName?.[0] ?? '?').toUpperCase()}${(
    me?.lastName?.[0] ?? ''
  ).toUpperCase()}`;
  const fullName = `${me?.firstName ?? ''} ${me?.lastName ?? ''}`.trim() || '—';

  // Profils du foyer SUR CE CLUB UNIQUEMENT. Les profils sur d'autres
  // clubs (autre tenant) sont accessibles via "Changer de profil / club"
  // qui ramène à SelectProfile avec la liste complète.
  const currentClubProfiles = currentClubId
    ? profiles.filter((p) => p.clubId === currentClubId)
    : profiles;

  return (
    <div className="user-menu" ref={containerRef}>
      <button
        type="button"
        className="user-menu__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Menu utilisateur — ${fullName}`}
      >
        <span className="user-menu__avatar">{initials}</span>
        <span
          className="material-symbols-outlined user-menu__chevron"
          aria-hidden="true"
        >
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {open ? (
        <div className="user-menu__dropdown" role="menu">
          {/* En-tête : nom + email + club courant */}
          <div className="user-menu__header">
            <span className="user-menu__avatar user-menu__avatar--lg">
              {initials}
            </span>
            <div className="user-menu__header-text">
              <strong>{fullName}</strong>
              {me?.email ? (
                <small className="user-menu__email">{me.email}</small>
              ) : null}
              {clubName ? (
                <small className="user-menu__club">
                  <span
                    className="material-symbols-outlined"
                    aria-hidden="true"
                  >
                    apartment
                  </span>
                  {clubName}
                </small>
              ) : null}
            </div>
          </div>

          {/* Profils du foyer du CLUB COURANT uniquement (membres du
              foyer sur ce club). Les profils sur d'autres clubs sont
              accessibles via "Changer de profil / club" — sinon
              "Profils du foyer" est faux sémantiquement. */}
          {currentClubProfiles.length > 1 ? (
            <>
              <div className="user-menu__section-title">Profils du foyer</div>
              <ul className="user-menu__profile-list">
                {currentClubProfiles.map((p) => (
                  <li key={profileRowKey(p)}>
                    <button
                      type="button"
                      className="user-menu__profile-item"
                      disabled={switching}
                      onClick={() => void switchToProfile(p)}
                      role="menuitem"
                    >
                      <span className="user-menu__profile-avatar">
                        {p.firstName.slice(0, 1).toUpperCase()}
                        {p.lastName.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="user-menu__profile-text">
                        <strong>
                          {p.firstName} {p.lastName}
                        </strong>
                        {p.clubName ? <small>{p.clubName}</small> : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <hr className="user-menu__sep" />
            </>
          ) : null}

          {/* Admin du club courant — seulement si l'user est admin DU
              CLUB COURANT (pas d'un autre club). Évite la confusion. */}
          {canAdminCurrentClub ? (
            <button
              type="button"
              className="user-menu__item user-menu__item--primary"
              onClick={handleAdmin}
              role="menuitem"
            >
              <span
                className="material-symbols-outlined"
                aria-hidden="true"
              >
                admin_panel_settings
              </span>
              <span>Administration du club</span>
            </button>
          ) : null}

          <button
            type="button"
            className="user-menu__item"
            onClick={handleChangeProfile}
            role="menuitem"
          >
            <span
              className="material-symbols-outlined"
              aria-hidden="true"
            >
              swap_horiz
            </span>
            <span>Changer de profil / club</span>
          </button>

          <button
            type="button"
            className="user-menu__item"
            onClick={handleSettings}
            role="menuitem"
          >
            <span
              className="material-symbols-outlined"
              aria-hidden="true"
            >
              settings
            </span>
            <span>Paramètres</span>
          </button>

          <hr className="user-menu__sep" />

          <button
            type="button"
            className="user-menu__item user-menu__item--danger"
            onClick={handleLogout}
            role="menuitem"
          >
            <span
              className="material-symbols-outlined"
              aria-hidden="true"
            >
              logout
            </span>
            <span>Se déconnecter</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
