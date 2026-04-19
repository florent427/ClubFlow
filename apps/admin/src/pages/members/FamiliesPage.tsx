import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CLUB_CONTACTS,
  CLUB_FAMILIES,
  CLUB_MEMBERS,
  DELETE_CLUB_FAMILY,
} from '../../lib/documents';
import type {
  ClubContactsQueryData,
  FamiliesQueryData,
  MembersQueryData,
} from '../../lib/types';
import { FamilyDetailDrawer } from './FamilyDetailDrawer';
import { useMembersUi } from './members-ui-context';
import { useToast } from '../../components/ToastProvider';

export function FamiliesPage() {
  const { drawerFamilyId, setDrawerFamilyId } = useMembersUi();
  const [familySearch, setFamilySearch] = useState('');
  const { showToast } = useToast();

  const { data: famData, refetch: refetchFamilies } =
    useQuery<FamiliesQueryData>(CLUB_FAMILIES);
  const { data: membersData } = useQuery<MembersQueryData>(CLUB_MEMBERS);
  const { data: contactsData } = useQuery<ClubContactsQueryData>(CLUB_CONTACTS);

  const [deleteFamily] = useMutation(DELETE_CLUB_FAMILY, {
    onCompleted: () => {
      void refetchFamilies();
      showToast('Foyer supprimé.', 'success');
    },
    onError: (e) => {
      showToast(e.message, 'error');
    },
  });

  const members = membersData?.clubMembers ?? [];
  const families = famData?.clubFamilies ?? [];

  const memberNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of members) {
      m.set(x.id, `${x.firstName} ${x.lastName}`);
    }
    return m;
  }, [members]);

  const memberLastNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of members) {
      m.set(x.id, x.lastName);
    }
    return m;
  }, [members]);

  const contactNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of contactsData?.clubContacts ?? []) {
      m.set(c.id, `${c.firstName} ${c.lastName}`);
    }
    return m;
  }, [contactsData?.clubContacts]);

  const contactLastNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of contactsData?.clubContacts ?? []) {
      m.set(c.id, c.lastName);
    }
    return m;
  }, [contactsData?.clubContacts]);

  const deriveFamilyLabel = (
    links: Array<{ memberId: string | null; contactId: string | null }>,
  ): string | null => {
    const lastNames = new Set<string>();
    for (const l of links) {
      const ln =
        (l.contactId ? contactLastNameById.get(l.contactId) : null) ??
        (l.memberId ? memberLastNameById.get(l.memberId) : null);
      if (ln && ln.trim()) lastNames.add(ln.trim());
    }
    if (lastNames.size === 0) return null;
    return `Famille ${Array.from(lastNames).sort().join('-')}`;
  };

  const filteredFamilies = useMemo(() => {
    const raw = familySearch.trim().toLowerCase();
    if (!raw) return families;
    return families.filter((f) => {
      const labelLower = (f.label ?? deriveFamilyLabel(f.links) ?? '')
        .trim()
        .toLowerCase();
      const fallback = 'foyer sans nom';
      const haystack = labelLower || fallback;
      return haystack.includes(raw);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [families, familySearch, memberLastNameById, contactLastNameById]);

  function onDeleteFamily(familyId: string) {
    if (
      !window.confirm(
        'Supprimer ce foyer ? Les fiches membres ne sont pas supprimées.',
      )
    ) {
      return;
    }
    void deleteFamily({ variables: { familyId } }).then(() => {
      if (drawerFamilyId === familyId) setDrawerFamilyId(null);
    });
  }

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <div className="members-hero__actions">
          <div>
            <p className="members-loom__eyebrow">Membres · Familles</p>
            <h1 className="members-loom__title">Foyers et payeur unique</h1>
            <p className="members-loom__lede">
              Un seul payeur par famille. Les fiches membres doivent exister
              avant le regroupement. Cliquez sur un foyer pour le modifier.
            </p>
          </div>
          <Link
            to="/members/families/new"
            className="btn btn-primary members-hero__cta"
          >
            Nouveau foyer
          </Link>
        </div>
      </header>

      <div className="members-loom__grid members-loom__grid--single">
        <section className="members-panel members-panel--table">
          <h2 className="members-panel__h">Foyers</h2>
          <label className="field members-directory__search">
            <span>Recherche (libellé)</span>
            <input
              type="search"
              value={familySearch}
              onChange={(e) => setFamilySearch(e.target.value)}
              placeholder="Ex. Martin"
              autoComplete="off"
            />
          </label>
          {families.length === 0 ? (
            <p className="muted">Aucun foyer enregistré.</p>
          ) : filteredFamilies.length === 0 ? (
            <p className="muted">Aucun foyer ne correspond à cette recherche.</p>
          ) : (
            <ul className="families-list">
              {filteredFamilies.map((f) => {
                const payers = f.links.filter((l) => l.linkRole === 'PAYER');
                const active = drawerFamilyId === f.id;
                return (
                  <li
                    key={f.id}
                    className={`families-card${active ? ' families-card--active' : ''}`}
                  >
                    <div className="families-card__row">
                      <div
                        className="families-card__surface"
                        role="button"
                        tabIndex={0}
                        onClick={() => setDrawerFamilyId(f.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setDrawerFamilyId(f.id);
                          }
                        }}
                      >
                        <div className="families-card__head">
                          <strong>
                            {f.label ?? deriveFamilyLabel(f.links) ?? 'Foyer sans nom'}
                            {f.needsPayer ? (
                              <span className="families-needs-payer-badge">
                                Payeur manquant
                              </span>
                            ) : null}
                          </strong>
                        </div>
                        <p className="families-card__meta">
                          Payeur :{' '}
                          {payers[0]
                            ? payers[0].memberId
                              ? (memberNameById.get(payers[0].memberId) ??
                                payers[0].memberId)
                              : payers[0].contactId
                                ? (contactNameById.get(payers[0].contactId) ??
                                  `Contact ${payers[0].contactId.slice(0, 8)}…`)
                                : '—'
                            : '—'}
                        </p>
                        <p className="families-card__meta">
                          Membres :{' '}
                          {f.links.length === 0
                            ? '—'
                            : f.links
                                .filter((l) => l.memberId)
                                .map(
                                  (l) =>
                                    memberNameById.get(l.memberId!) ??
                                    l.memberId,
                                )
                                .join(', ') ||
                              '—'}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-tight families-card__delete"
                        onClick={() => onDeleteFamily(f.id)}
                      >
                        Supprimer
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {drawerFamilyId ? (
        <FamilyDetailDrawer
          familyId={drawerFamilyId}
          onClose={() => setDrawerFamilyId(null)}
        />
      ) : null}
    </>
  );
}
