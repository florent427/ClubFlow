import { useQuery } from '@apollo/client/react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { QuickMessageModal } from '../../components/QuickMessageModal';
import {
  CLUB_DYNAMIC_GROUPS,
  CLUB_GRADE_LEVELS,
  CLUB_MEMBERS,
  CLUB_ROLE_DEFINITIONS,
} from '../../lib/documents';
import { useClubCommunicationEnabled } from '../../lib/useClubCommunicationEnabled';
import type {
  DynamicGroupsQueryData,
  GradeLevelsQueryData,
  MembersQueryData,
  RoleDefinitionsQueryData,
} from '../../lib/types';
import { BUILTIN_ROLE_OPTIONS } from './members-constants';
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

/** Âge révolu à la date du jour (anniversaire non encore passé → année − 1). */
function ageFromBirthDate(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) {
    age -= 1;
  }
  return age;
}

function toggleString(prev: string[], value: string): string[] {
  if (prev.includes(value)) return prev.filter((x) => x !== value);
  return [...prev, value];
}

function selectionHint(count: number): string {
  if (count === 0) return 'Tous';
  return `${count} sélectionné${count > 1 ? 's' : ''}`;
}

export function MembersDirectoryPage() {
  const { drawerMemberId, setDrawerMemberId } = useMembersUi();
  const commEnabled = useClubCommunicationEnabled();
  const [directorySearch, setDirectorySearch] = useState('');
  const [filterGradeIds, setFilterGradeIds] = useState<string[]>([]);
  const [filterAgeMin, setFilterAgeMin] = useState('');
  const [filterAgeMax, setFilterAgeMax] = useState('');
  /** Vide : tous · sinon : STUDENT / COACH / BOARD / `custom:{id}` */
  const [filterRoleKeys, setFilterRoleKeys] = useState<string[]>([]);
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [quickMember, setQuickMember] = useState<{
    id: string;
    label: string;
  } | null>(null);

  const { data, loading, error } = useQuery<MembersQueryData>(CLUB_MEMBERS);
  const { data: groupsData } = useQuery<DynamicGroupsQueryData>(
    CLUB_DYNAMIC_GROUPS,
  );
  const { data: gradesData } = useQuery<GradeLevelsQueryData>(CLUB_GRADE_LEVELS);
  const { data: roleDefsData } = useQuery<RoleDefinitionsQueryData>(
    CLUB_ROLE_DEFINITIONS,
  );

  const members = data?.clubMembers ?? [];
  const groups = groupsData?.clubDynamicGroups ?? [];
  const gradeLevels = gradesData?.clubGradeLevels ?? [];
  const roleDefinitions = roleDefsData?.clubRoleDefinitions ?? [];

  const hasActiveFilters =
    filterGradeIds.length > 0 ||
    filterAgeMin.trim() !== '' ||
    filterAgeMax.trim() !== '' ||
    filterRoleKeys.length > 0 ||
    filterStatuses.length > 0;

  const filteredMembers = useMemo(() => {
    let rows = members;
    const q = directorySearch.trim().toLowerCase();
    if (q) {
      rows = rows.filter((m) => {
        const full = `${m.firstName} ${m.lastName}`.toLowerCase();
        return full.includes(q);
      });
    }
    if (filterGradeIds.length > 0) {
      rows = rows.filter(
        (m) =>
          m.gradeLevelId != null && filterGradeIds.includes(m.gradeLevelId),
      );
    }
    const minA = filterAgeMin.trim() === '' ? null : Number.parseInt(filterAgeMin, 10);
    const maxA = filterAgeMax.trim() === '' ? null : Number.parseInt(filterAgeMax, 10);
    if (minA != null && !Number.isNaN(minA)) {
      rows = rows.filter((m) => {
        const a = ageFromBirthDate(m.birthDate);
        if (a === null) return false;
        return a >= minA;
      });
    }
    if (maxA != null && !Number.isNaN(maxA)) {
      rows = rows.filter((m) => {
        const a = ageFromBirthDate(m.birthDate);
        if (a === null) return false;
        return a <= maxA;
      });
    }
    if (filterRoleKeys.length > 0) {
      rows = rows.filter((m) =>
        filterRoleKeys.some((key) => {
          if (key.startsWith('custom:')) {
            const rid = key.slice('custom:'.length);
            return m.customRoles.some((r) => r.id === rid);
          }
          return m.roles.includes(key);
        }),
      );
    }
    if (filterStatuses.length > 0) {
      rows = rows.filter((m) => filterStatuses.includes(m.status));
    }
    return rows;
  }, [
    members,
    directorySearch,
    filterGradeIds,
    filterAgeMin,
    filterAgeMax,
    filterRoleKeys,
    filterStatuses,
  ]);

  function resetFilters() {
    setFilterGradeIds([]);
    setFilterAgeMin('');
    setFilterAgeMax('');
    setFilterRoleKeys([]);
    setFilterStatuses([]);
  }

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
          <div className="members-directory__filters" aria-label="Filtres annuaire">
            <div className="field members-filter-dropdown">
              <span>Grade</span>
              <details>
                <summary className="members-filter-dropdown__summary">
                  <span>{selectionHint(filterGradeIds.length)}</span>
                </summary>
                <div className="members-filter-dropdown__panel">
                  {gradeLevels.length === 0 ? (
                    <p className="muted members-filter-dropdown__hint">
                      Aucun grade défini.
                    </p>
                  ) : (
                    gradeLevels.map((g) => (
                      <label
                        key={g.id}
                        className="members-filter-dropdown__opt"
                      >
                        <input
                          type="checkbox"
                          checked={filterGradeIds.includes(g.id)}
                          onChange={() =>
                            setFilterGradeIds((p) => toggleString(p, g.id))
                          }
                        />
                        <span>{g.label}</span>
                      </label>
                    ))
                  )}
                </div>
              </details>
            </div>
            <label className="field">
              <span>Âge min</span>
              <input
                type="number"
                min={0}
                max={120}
                inputMode="numeric"
                value={filterAgeMin}
                onChange={(e) => setFilterAgeMin(e.target.value)}
                placeholder="—"
              />
            </label>
            <label className="field">
              <span>Âge max</span>
              <input
                type="number"
                min={0}
                max={120}
                inputMode="numeric"
                value={filterAgeMax}
                onChange={(e) => setFilterAgeMax(e.target.value)}
                placeholder="—"
              />
            </label>
            <div className="field members-filter-dropdown">
              <span>Rôle</span>
              <details>
                <summary className="members-filter-dropdown__summary">
                  <span>{selectionHint(filterRoleKeys.length)}</span>
                </summary>
                <div className="members-filter-dropdown__panel">
                  {BUILTIN_ROLE_OPTIONS.map((o) => (
                    <label
                      key={o.value}
                      className="members-filter-dropdown__opt"
                    >
                      <input
                        type="checkbox"
                        checked={filterRoleKeys.includes(o.value)}
                        onChange={() =>
                          setFilterRoleKeys((p) => toggleString(p, o.value))
                        }
                      />
                      <span>{o.label}</span>
                    </label>
                  ))}
                  {roleDefinitions.map((r) => {
                    const key = `custom:${r.id}`;
                    return (
                      <label
                        key={r.id}
                        className="members-filter-dropdown__opt"
                      >
                        <input
                          type="checkbox"
                          checked={filterRoleKeys.includes(key)}
                          onChange={() =>
                            setFilterRoleKeys((p) => toggleString(p, key))
                          }
                        />
                        <span>{r.label}</span>
                      </label>
                    );
                  })}
                </div>
              </details>
            </div>
            <div className="field members-filter-dropdown">
              <span>Statut</span>
              <details>
                <summary className="members-filter-dropdown__summary">
                  <span>{selectionHint(filterStatuses.length)}</span>
                </summary>
                <div className="members-filter-dropdown__panel">
                  <label className="members-filter-dropdown__opt">
                    <input
                      type="checkbox"
                      checked={filterStatuses.includes('ACTIVE')}
                      onChange={() =>
                        setFilterStatuses((p) => toggleString(p, 'ACTIVE'))
                      }
                    />
                    <span>Actif</span>
                  </label>
                  <label className="members-filter-dropdown__opt">
                    <input
                      type="checkbox"
                      checked={filterStatuses.includes('INACTIVE')}
                      onChange={() =>
                        setFilterStatuses((p) => toggleString(p, 'INACTIVE'))
                      }
                    />
                    <span>Inactif</span>
                  </label>
                </div>
              </details>
            </div>
            {hasActiveFilters ? (
              <div className="members-directory__filters-reset">
                <button
                  type="button"
                  className="btn btn-ghost btn-tight"
                  onClick={resetFilters}
                >
                  Réinitialiser les filtres
                </button>
              </div>
            ) : null}
          </div>
          {loading ? (
            <p className="muted">Chargement…</p>
          ) : error ? (
            <p className="form-error">{error.message}</p>
          ) : members.length === 0 ? (
            <p className="muted">Aucun membre pour ce club.</p>
          ) : filteredMembers.length === 0 ? (
            <p className="muted">
              Aucun membre ne correspond à la recherche ou aux filtres.
            </p>
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
                    <th className="members-table__th-quick-msg">
                      <span className="sr-only">Message</span>
                    </th>
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
                          {m.status === 'ACTIVE' ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                      <td
                        className="members-table__td-quick-msg"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {commEnabled ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-tight members-table__quick-msg-btn"
                            title="Envoyer un message"
                            aria-label={`Message à ${m.firstName} ${m.lastName}`}
                            onClick={() =>
                              setQuickMember({
                                id: m.id,
                                label: `${m.firstName} ${m.lastName}`,
                              })
                            }
                          >
                            <span className="material-symbols-outlined" aria-hidden>
                              mail
                            </span>
                          </button>
                        ) : null}
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
      {quickMember ? (
        <QuickMessageModal
          open
          onClose={() => setQuickMember(null)}
          recipientType="MEMBER"
          recipientId={quickMember.id}
          recipientLabel={quickMember.label}
        />
      ) : null}
    </>
  );
}
