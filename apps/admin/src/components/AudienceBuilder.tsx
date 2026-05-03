import { useQuery } from '@apollo/client/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CLUB_DYNAMIC_GROUPS,
  CLUB_MEMBERS,
  PREVIEW_CLUB_CAMPAIGN_AUDIENCE,
} from '../lib/documents';
import type {
  AudienceAgeFilterStr,
  AudienceFilterInputData,
  DynamicGroupsQueryData,
  MemberClubRoleStr,
  MembersQueryData,
  MembershipRoleStr,
  PreviewCampaignAudienceQueryData,
} from '../lib/types';

/* ------------------------------------------------------------------ */
/* Référentiels d'enums (libellés FR + ordre d'affichage)             */
/* ------------------------------------------------------------------ */

const MEMBERSHIP_ROLES: { value: MembershipRoleStr; label: string; hint?: string }[] = [
  { value: 'CLUB_ADMIN', label: 'Administrateurs', hint: 'Tous droits' },
  { value: 'BOARD', label: 'Bureau', hint: 'Conseil d’administration' },
  { value: 'TREASURER', label: 'Trésorier·e', hint: 'Compta + facturation' },
  { value: 'SECRETARY', label: 'Secrétaire' },
  { value: 'COMM_MANAGER', label: 'Resp. com.', hint: 'Vitrine + campagnes' },
  { value: 'PROJECT_MANAGER', label: 'Chef·fe de projet' },
  { value: 'COACH', label: 'Coachs (admin)' },
  { value: 'STAFF', label: 'Staff' },
];

const CLUB_MEMBER_ROLES: { value: MemberClubRoleStr; label: string; hint?: string }[] = [
  { value: 'STUDENT', label: 'Élèves', hint: 'Adhérents pratiquants' },
  { value: 'COACH', label: 'Coachs', hint: 'Encadrants déclarés' },
  { value: 'BOARD', label: 'Bureau (membre)', hint: 'Élu·e·s du bureau' },
];

const AGE_FILTERS: { value: AudienceAgeFilterStr; label: string; description: string }[] = [
  { value: 'ALL', label: 'Tous les âges', description: 'Adultes et mineurs' },
  { value: 'ADULTS', label: 'Adultes', description: '≥ 18 ans' },
  { value: 'MINORS', label: 'Mineurs', description: '< 18 ans' },
];

/* ------------------------------------------------------------------ */
/* Hook utilitaire (debounce d'une valeur)                            */
/* ------------------------------------------------------------------ */

function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

/* ------------------------------------------------------------------ */
/* Helpers de normalisation                                           */
/* ------------------------------------------------------------------ */

/** Vide tous les tableaux/booleans pour ne garder que les clés non-triviales. */
function normalizeFilter(f: AudienceFilterInputData): AudienceFilterInputData {
  const out: AudienceFilterInputData = {};
  if (f.includeAllMembers) out.includeAllMembers = true;
  if (f.dynamicGroupIds && f.dynamicGroupIds.length > 0)
    out.dynamicGroupIds = f.dynamicGroupIds;
  if (f.membershipRoles && f.membershipRoles.length > 0)
    out.membershipRoles = f.membershipRoles;
  if (f.clubMemberRoles && f.clubMemberRoles.length > 0)
    out.clubMemberRoles = f.clubMemberRoles;
  if (f.memberIds && f.memberIds.length > 0) out.memberIds = f.memberIds;
  if (f.ageFilter && f.ageFilter !== 'ALL') out.ageFilter = f.ageFilter;
  return out;
}

function ariaPressed(active: boolean): 'true' | 'false' {
  return active ? 'true' : 'false';
}

/* ------------------------------------------------------------------ */
/* Composant principal                                                */
/* ------------------------------------------------------------------ */

export type AudienceBuilderProps = {
  /** Valeur courante du filtre. `null` = "non défini" (mode "tous les actifs" implicite). */
  value: AudienceFilterInputData | null;
  /** Émis à chaque modification. Le parent stocke et envoie au backend. */
  onChange: (next: AudienceFilterInputData) => void;
  /** Si fourni, désactive la totalité des inputs (envoi en cours…). */
  disabled?: boolean;
};

export function AudienceBuilder({ value, onChange, disabled }: AudienceBuilderProps) {
  const filter: AudienceFilterInputData = value ?? { includeAllMembers: true };
  const isAllMode = !!filter.includeAllMembers;

  /* Source de données (groupes + membres). */
  const { data: groupsData, loading: groupsLoading } = useQuery<DynamicGroupsQueryData>(
    CLUB_DYNAMIC_GROUPS,
  );
  const { data: membersData, loading: membersLoading } = useQuery<MembersQueryData>(
    CLUB_MEMBERS,
  );
  const groups = groupsData?.clubDynamicGroups ?? [];
  const members = membersData?.clubMembers ?? [];

  /* Recherche membre (chips). */
  const [memberSearch, setMemberSearch] = useState('');
  const debouncedSearch = useDebouncedValue(memberSearch, 200);
  const filteredMembers = useMemo(() => {
    if (!debouncedSearch.trim()) return [];
    const needle = debouncedSearch.trim().toLowerCase();
    const selected = new Set(filter.memberIds ?? []);
    return members
      .filter((m) => m.status === 'ACTIVE' && !selected.has(m.id))
      .filter((m) => {
        const haystack = `${m.firstName} ${m.lastName} ${m.email}`.toLowerCase();
        return haystack.includes(needle);
      })
      .slice(0, 8);
  }, [members, debouncedSearch, filter.memberIds]);

  const memberById = useMemo(() => {
    const map = new Map<string, (typeof members)[number]>();
    for (const m of members) map.set(m.id, m);
    return map;
  }, [members]);

  /* Preview live (debounced). */
  const debouncedFilter = useDebouncedValue(filter, 250);
  const normalizedForPreview = useMemo(
    () => normalizeFilter(debouncedFilter),
    [debouncedFilter],
  );
  const previewVariables = useMemo(
    () => ({ audience: normalizedForPreview }),
    [normalizedForPreview],
  );
  const { data: previewData, loading: previewLoading } =
    useQuery<PreviewCampaignAudienceQueryData>(PREVIEW_CLUB_CAMPAIGN_AUDIENCE, {
      variables: previewVariables,
      fetchPolicy: 'network-only',
    });
  const previewCount = previewData?.previewClubCampaignAudience.count ?? null;
  const previewSample =
    previewData?.previewClubCampaignAudience.sampleNames ?? [];

  /* Garde-fou : si l'utilisateur n'a rien sélectionné en mode "filtré",
     on garde une trace du dernier compte affiché pour éviter le clignotement. */
  const lastDisplayedRef = useRef<{ count: number; sample: string[] }>({
    count: 0,
    sample: [],
  });
  if (previewCount !== null) {
    lastDisplayedRef.current = { count: previewCount, sample: previewSample };
  }

  /* ---------- Handlers ---------- */

  function setMode(mode: 'all' | 'filtered') {
    if (mode === 'all') {
      onChange({ includeAllMembers: true });
    } else {
      onChange({
        includeAllMembers: false,
        dynamicGroupIds: filter.dynamicGroupIds ?? [],
        membershipRoles: filter.membershipRoles ?? [],
        clubMemberRoles: filter.clubMemberRoles ?? [],
        ageFilter: filter.ageFilter ?? 'ALL',
        memberIds: filter.memberIds ?? [],
      });
    }
  }

  function patch(p: Partial<AudienceFilterInputData>) {
    onChange({ ...filter, includeAllMembers: false, ...p });
  }

  function toggleInArray<T extends string>(arr: T[] | null | undefined, v: T): T[] {
    const set = new Set(arr ?? []);
    if (set.has(v)) set.delete(v);
    else set.add(v);
    return Array.from(set);
  }

  /* ---------- Rendu ---------- */

  return (
    <div className="audience-builder" aria-disabled={disabled || undefined}>
      {/* Bandeau preview */}
      <div
        className={`audience-preview ${
          previewCount !== null && previewCount > 0
            ? 'audience-preview--ok'
            : 'audience-preview--empty'
        }`}
        role="status"
        aria-live="polite"
      >
        <div className="audience-preview__count">
          <span className="audience-preview__num">
            {previewLoading && previewCount === null
              ? '…'
              : (previewCount ?? lastDisplayedRef.current.count)}
          </span>
          <span className="audience-preview__label">
            {(previewCount ?? lastDisplayedRef.current.count) > 1
              ? 'destinataires'
              : 'destinataire'}
          </span>
        </div>
        {previewSample.length > 0 || lastDisplayedRef.current.sample.length > 0 ? (
          <div className="audience-preview__sample">
            {(previewSample.length > 0
              ? previewSample
              : lastDisplayedRef.current.sample
            ).join(' · ')}
            {(previewCount ?? lastDisplayedRef.current.count) >
            (previewSample.length || lastDisplayedRef.current.sample.length)
              ? ` · +${
                  (previewCount ?? lastDisplayedRef.current.count) -
                  (previewSample.length || lastDisplayedRef.current.sample.length)
                }`
              : ''}
          </div>
        ) : null}
      </div>

      {/* Mode toggle */}
      <div className="audience-mode" role="radiogroup" aria-label="Mode d’audience">
        <button
          type="button"
          className={`audience-mode__btn ${isAllMode ? 'audience-mode__btn--active' : ''}`}
          onClick={() => setMode('all')}
          disabled={disabled}
          role="radio"
          aria-checked={ariaPressed(isAllMode)}
        >
          <span className="audience-mode__title">Tous les membres actifs</span>
          <span className="audience-mode__hint">
            Aucun filtre — diffusion à toute la communauté.
          </span>
        </button>
        <button
          type="button"
          className={`audience-mode__btn ${!isAllMode ? 'audience-mode__btn--active' : ''}`}
          onClick={() => setMode('filtered')}
          disabled={disabled}
          role="radio"
          aria-checked={ariaPressed(!isAllMode)}
        >
          <span className="audience-mode__title">Audience ciblée</span>
          <span className="audience-mode__hint">
            Combinez groupes, rôles, âge et membres individuels.
          </span>
        </button>
      </div>

      {!isAllMode ? (
        <div className="audience-builder__sections">
          {/* Groupes dynamiques */}
          <section className="audience-section">
            <header className="audience-section__head">
              <h3 className="audience-section__title">Groupes dynamiques</h3>
              <p className="audience-section__hint">
                Filtres calculés (âge, grades…). Plusieurs groupes ⇒ union.
              </p>
            </header>
            {groupsLoading ? (
              <p className="muted">Chargement…</p>
            ) : groups.length === 0 ? (
              <p className="muted">
                Aucun groupe dynamique configuré.{' '}
                <a href="/members/groups">Créer un groupe</a>
              </p>
            ) : (
              <div className="audience-chips">
                {groups.map((g) => {
                  const active = (filter.dynamicGroupIds ?? []).includes(g.id);
                  return (
                    <button
                      type="button"
                      key={g.id}
                      className={`audience-chip ${active ? 'audience-chip--active' : ''}`}
                      onClick={() =>
                        patch({
                          dynamicGroupIds: toggleInArray(filter.dynamicGroupIds, g.id),
                        })
                      }
                      disabled={disabled}
                      aria-pressed={ariaPressed(active)}
                    >
                      <span className="audience-chip__main">{g.name}</span>
                      <span className="audience-chip__count">
                        {g.matchingActiveMembersCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Rôles d'accès admin */}
          <section className="audience-section">
            <header className="audience-section__head">
              <h3 className="audience-section__title">Rôles d’accès</h3>
              <p className="audience-section__hint">
                Cible les administrateurs, le bureau, les coachs déclarés en
                gestion, etc.
              </p>
            </header>
            <div className="audience-chips">
              {MEMBERSHIP_ROLES.map((r) => {
                const active = (filter.membershipRoles ?? []).includes(r.value);
                return (
                  <button
                    type="button"
                    key={r.value}
                    className={`audience-chip ${active ? 'audience-chip--active' : ''}`}
                    onClick={() =>
                      patch({
                        membershipRoles: toggleInArray(filter.membershipRoles, r.value),
                      })
                    }
                    disabled={disabled}
                    aria-pressed={ariaPressed(active)}
                    title={r.hint ?? ''}
                  >
                    <span className="audience-chip__main">{r.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Rôles club portés par le membre */}
          <section className="audience-section">
            <header className="audience-section__head">
              <h3 className="audience-section__title">Rôles dans le club</h3>
              <p className="audience-section__hint">
                Identité du membre dans la vie du club (élève, coach, bureau).
              </p>
            </header>
            <div className="audience-chips">
              {CLUB_MEMBER_ROLES.map((r) => {
                const active = (filter.clubMemberRoles ?? []).includes(r.value);
                return (
                  <button
                    type="button"
                    key={r.value}
                    className={`audience-chip ${active ? 'audience-chip--active' : ''}`}
                    onClick={() =>
                      patch({
                        clubMemberRoles: toggleInArray(filter.clubMemberRoles, r.value),
                      })
                    }
                    disabled={disabled}
                    aria-pressed={ariaPressed(active)}
                    title={r.hint ?? ''}
                  >
                    <span className="audience-chip__main">{r.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Âge */}
          <section className="audience-section">
            <header className="audience-section__head">
              <h3 className="audience-section__title">Âge</h3>
              <p className="audience-section__hint">
                Restreint l’audience (intersection appliquée APRÈS les autres
                critères).
              </p>
            </header>
            <div className="audience-segmented" role="radiogroup" aria-label="Âge">
              {AGE_FILTERS.map((a) => {
                const active = (filter.ageFilter ?? 'ALL') === a.value;
                return (
                  <button
                    type="button"
                    key={a.value}
                    className={`audience-segmented__btn ${
                      active ? 'audience-segmented__btn--active' : ''
                    }`}
                    onClick={() => patch({ ageFilter: a.value })}
                    disabled={disabled}
                    role="radio"
                    aria-checked={ariaPressed(active)}
                  >
                    <span className="audience-segmented__label">{a.label}</span>
                    <span className="audience-segmented__hint">{a.description}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Membres individuels */}
          <section className="audience-section">
            <header className="audience-section__head">
              <h3 className="audience-section__title">Membres individuels</h3>
              <p className="audience-section__hint">
                Ajoutez des membres précis en plus des critères ci-dessus.
              </p>
            </header>
            <div className="audience-member-search">
              <input
                type="search"
                className="members-field__input"
                placeholder="Rechercher un membre par nom ou e-mail…"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                disabled={disabled || membersLoading}
                aria-label="Rechercher un membre"
              />
              {filteredMembers.length > 0 ? (
                <ul className="audience-member-results" role="listbox">
                  {filteredMembers.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        className="audience-member-result"
                        onClick={() => {
                          patch({
                            memberIds: [...(filter.memberIds ?? []), m.id],
                          });
                          setMemberSearch('');
                        }}
                        disabled={disabled}
                      >
                        <span className="audience-member-result__name">
                          {m.firstName} {m.lastName}
                        </span>
                        <span className="audience-member-result__sub">{m.email}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {filter.memberIds && filter.memberIds.length > 0 ? (
              <div className="audience-member-chips">
                {filter.memberIds.map((id) => {
                  const m = memberById.get(id);
                  const label = m ? `${m.firstName} ${m.lastName}` : id.slice(0, 8);
                  return (
                    <span key={id} className="audience-member-chip">
                      {label}
                      <button
                        type="button"
                        className="audience-member-chip__remove"
                        aria-label={`Retirer ${label}`}
                        onClick={() =>
                          patch({
                            memberIds: (filter.memberIds ?? []).filter((x) => x !== id),
                          })
                        }
                        disabled={disabled}
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="muted" style={{ marginTop: '0.5rem' }}>
                Aucun membre individuel ajouté.
              </p>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
