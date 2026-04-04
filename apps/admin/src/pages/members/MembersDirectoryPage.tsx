import { useQuery } from '@apollo/client/react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CLUB_DYNAMIC_GROUPS, CLUB_MEMBERS } from '../../lib/documents';
import type { DynamicGroupsQueryData, MembersQueryData } from '../../lib/types';
import { MemberDetailDrawer } from './MemberDetailDrawer';
import { useMembersUi } from './members-ui-context';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export function MembersDirectoryPage() {
  const { drawerMemberId, setDrawerMemberId } = useMembersUi();
  const [directorySearch, setDirectorySearch] = useState('');

  const { data, loading, error } = useQuery<MembersQueryData>(CLUB_MEMBERS);
  const { data: groupsData } = useQuery<DynamicGroupsQueryData>(
    CLUB_DYNAMIC_GROUPS,
  );

  const members = data?.clubMembers ?? [];
  const groups = groupsData?.clubDynamicGroups ?? [];

  const filteredMembers = useMemo(() => {
    const q = directorySearch.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const full = `${m.firstName} ${m.lastName}`.toLowerCase();
      return full.includes(q);
    });
  }, [members, directorySearch]);

  useEffect(() => {
    if (!drawerMemberId || loading) return;
    if (members.length === 0) return;
    if (!members.some((m) => m.id === drawerMemberId)) {
      setDrawerMemberId(null);
    }
  }, [drawerMemberId, members, loading, setDrawerMemberId]);

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <div className="members-hero__actions">
          <div>
            <p className="members-loom__eyebrow">Module Membres</p>
            <h1 className="members-loom__title">Référentiel adhérents</h1>
            <p className="members-loom__lede">
              Annuaire, grades et rôles personnalisés — conception ClubFlow
              (Stitch Athletic Editorial). Cliquez sur une ligne pour ouvrir la
              fiche.
            </p>
          </div>
          <Link
            to="/members/new"
            className="btn btn-primary members-hero__cta"
          >
            Nouveau membre
          </Link>
        </div>
      </header>

      <div className="members-loom__grid members-loom__grid--single">
        <section className="members-panel members-panel--table">
          <h2 className="members-panel__h">Annuaire</h2>
          <label className="field members-directory__search">
            <span>Recherche (prénom / nom)</span>
            <input
              type="search"
              value={directorySearch}
              onChange={(e) => setDirectorySearch(e.target.value)}
              placeholder="Ex. Martin"
              autoComplete="off"
            />
          </label>
          {loading ? (
            <p className="muted">Chargement…</p>
          ) : error ? (
            <p className="form-error">{error.message}</p>
          ) : members.length === 0 ? (
            <p className="muted">Aucun membre pour ce club.</p>
          ) : filteredMembers.length === 0 ? (
            <p className="muted">Aucun résultat pour cette recherche.</p>
          ) : (
            <div className="members-table-wrap">
              <table className="members-table">
                <thead>
                  <tr>
                    <th className="members-table__th-photo">
                      <span className="sr-only">Photo</span>
                    </th>
                    <th>Nom</th>
                    <th>Foyer</th>
                    <th>Grade</th>
                    <th>Naissance</th>
                    <th>Rôles</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.map((m) => (
                    <tr
                      key={m.id}
                      id={`member-row-${m.id}`}
                      className="members-table__row--clickable"
                      role="button"
                      tabIndex={0}
                      onClick={() => setDrawerMemberId(m.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setDrawerMemberId(m.id);
                        }
                      }}
                    >
                      <td className="members-table__td-photo">
                        {m.photoUrl ? (
                          <img
                            src={m.photoUrl}
                            alt=""
                            className="members-table__avatar"
                            width={36}
                            height={36}
                            draggable={false}
                          />
                        ) : (
                          <span
                            className="members-table__avatar members-table__avatar--empty"
                            aria-hidden
                          />
                        )}
                      </td>
                      <td>
                        <span className="members-table__name">
                          {m.firstName} {m.lastName}
                        </span>
                        {m.email ? (
                          <span className="members-table__sub">{m.email}</span>
                        ) : null}
                      </td>
                      <td>
                        {m.family ? (
                          <span className="members-table__family">
                            <span className="members-table__family-name">
                              {m.family.label ?? 'Sans nom'}
                            </span>
                            <span
                              className={
                                m.familyLink?.linkRole === 'PAYER'
                                  ? 'members-pill'
                                  : 'members-pill members-pill--soft'
                              }
                            >
                              {m.familyLink?.linkRole === 'PAYER'
                                ? 'Payeur'
                                : 'Membre'}
                            </span>
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>{m.gradeLevel?.label ?? '—'}</td>
                      <td>{formatDate(m.birthDate)}</td>
                      <td>
                        <span className="members-pill-row">
                          {m.roles.map((r) => (
                            <span key={r} className="members-pill">
                              {r}
                            </span>
                          ))}
                          {m.customRoles.map((r) => (
                            <span
                              key={r.id}
                              className="members-pill members-pill--soft"
                            >
                              {r.label}
                            </span>
                          ))}
                        </span>
                      </td>
                      <td>
                        <span
                          className={
                            m.status === 'ACTIVE'
                              ? 'members-status members-status--ok'
                              : 'members-status'
                          }
                        >
                          {m.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="members-groups">
            <h3 className="members-groups__h">Groupes dynamiques</h3>
            <p className="muted members-groups__hint">
              Composition recalculée quand l’âge ou le grade change (API).
            </p>
            <ul className="members-groups__list">
              {groups.length === 0 ? (
                <li className="muted">Aucun groupe défini.</li>
              ) : (
                groups.map((g) => (
                  <li key={g.id} className="members-groups__item">
                    <div>
                      <strong>{g.name}</strong>
                      <span className="members-groups__meta">
                        {g.minAge != null || g.maxAge != null
                          ? `Âge ${g.minAge ?? '…'}–${g.maxAge ?? '…'} · `
                          : ''}
                        {g.gradeFilters.length > 0
                          ? g.gradeFilters.map((gf) => gf.label).join(', ')
                          : 'Tous grades'}
                      </span>
                    </div>
                    <span className="members-groups__count">
                      {g.matchingActiveMembersCount}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </section>
      </div>

      {drawerMemberId ? (
        <MemberDetailDrawer
          memberId={drawerMemberId}
          onClose={() => setDrawerMemberId(null)}
        />
      ) : null}
    </>
  );
}
