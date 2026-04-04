import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CLUB_MEMBERS, TRANSFER_CLUB_MEMBER_TO_FAMILY } from '../../lib/documents';
import type { MembersQueryData, TransferMemberFamilyMutationData } from '../../lib/types';
import { useMembersUi } from './members-ui-context';

function useMembersPathActive(): boolean {
  const { pathname } = useLocation();
  return pathname === '/members' || pathname.startsWith('/members/');
}

export function MembersCommandPalette() {
  const location = useLocation();
  const navigate = useNavigate();
  const active = useMembersPathActive();
  const { drawerFamilyId, setDrawerMemberId } = useMembersUi();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const { data } = useQuery<MembersQueryData>(CLUB_MEMBERS, {
    skip: !active,
  });

  const [transferToFamily] = useMutation<
    TransferMemberFamilyMutationData,
    { memberId: string; familyId: string; linkRole: string }
  >(TRANSFER_CLUB_MEMBER_TO_FAMILY, {
    refetchQueries: ['ClubFamilies', 'ClubMembers'],
  });

  const members = data?.clubMembers ?? [];

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members.slice(0, 12);
    return members
      .filter((m) => {
        const full = `${m.firstName} ${m.lastName}`.toLowerCase();
        return full.includes(q);
      })
      .slice(0, 12);
  }, [members, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const path = location.pathname;
      if (path !== '/members' && !path.startsWith('/members/')) {
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((v) => {
          const next = !v;
          if (next) {
            setQuery('');
            window.setTimeout(() => inputRef.current?.focus(), 10);
          }
          return next;
        });
        return;
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [location.pathname, open]);

  function goAnnuaire(m: MembersQueryData['clubMembers'][0]) {
    setDrawerMemberId(m.id);
    setOpen(false);
    navigate('/members');
  }

  async function addToCurrentFamily(m: MembersQueryData['clubMembers'][0]) {
    if (!drawerFamilyId) return;
    let msg = `Ajouter « ${m.firstName} ${m.lastName} » au foyer ouvert dans le panneau comme membre ?`;
    if (m.family && m.family.id !== drawerFamilyId) {
      msg =
        'Cette personne est dans un autre foyer. La transférer vers le foyer ouvert ? L’ancien lien sera retiré.';
      if (m.familyLink?.linkRole === 'PAYER') {
        const othersInOld = members.filter(
          (x) => x.family?.id === m.family?.id && x.id !== m.id,
        ).length;
        if (othersInOld > 0) {
          msg +=
            ' L’ancien foyer pourra être sans payeur jusqu’à désignation d’un payeur.';
        }
      }
    }
    if (!window.confirm(msg)) return;
    try {
      await transferToFamily({
        variables: {
          memberId: m.id,
          familyId: drawerFamilyId,
          linkRole: 'MEMBER',
        },
      });
      setOpen(false);
    } catch {
      /* erreur affichée par Apollo */
    }
  }

  if (!active) {
    return null;
  }

  return (
    <>
      {open ? (
        <div
          className="members-palette-backdrop"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            className="members-palette"
            role="dialog"
            aria-label="Recherche de membres"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              type="search"
              className="members-palette__input"
              placeholder="Nom, prénom…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
            <ul className="members-palette__list">
              {results.length === 0 ? (
                <li className="members-palette__empty muted">Aucun résultat</li>
              ) : (
                results.map((m) => (
                  <li key={m.id} className="members-palette__row">
                    <div className="members-palette__name">
                      <strong>
                        {m.firstName} {m.lastName}
                      </strong>
                      {m.family ? (
                        <span className="muted members-palette__sub">
                          {m.family.label ?? 'Foyer'}
                        </span>
                      ) : (
                        <span className="muted members-palette__sub">
                          Sans foyer
                        </span>
                      )}
                    </div>
                    <div className="members-palette__actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-tight"
                        onClick={() => goAnnuaire(m)}
                      >
                        Fiche
                      </button>
                      {drawerFamilyId &&
                      !(m.family?.id === drawerFamilyId) ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-tight"
                          onClick={() => void addToCurrentFamily(m)}
                        >
                          + Foyer
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))
              )}
            </ul>
            <button
              type="button"
              className="btn btn-ghost members-palette__close"
              onClick={() => setOpen(false)}
            >
              Fermer (Échap)
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
