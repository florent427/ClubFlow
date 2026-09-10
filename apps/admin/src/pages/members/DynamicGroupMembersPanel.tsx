import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import { useToast } from '../../components/ToastProvider';
import {
  ADD_MEMBERS_TO_DYNAMIC_GROUP,
  CLUB_MEMBERS,
  DYNAMIC_GROUP_MEMBERS,
  REMOVE_MEMBER_FROM_DYNAMIC_GROUP,
} from '../../lib/documents';
import type {
  DynamicGroupMembersQueryData,
  DynamicGroupMemberSourceStr,
  MembersQueryData,
} from '../../lib/types';

const SOURCE_LABEL: Record<DynamicGroupMemberSourceStr, string> = {
  CRITERIA: 'Par critères',
  MANUAL: 'Ajouté',
  BOTH: 'Critères + ajouté',
};

/**
 * Membres d'un groupe dynamique, depuis l'écran du groupe : qui en fait
 * partie et pourquoi (critères âge / grade, ajout manuel, les deux), ajout
 * de membres à la main, retrait d'une affectation manuelle.
 *
 * Un membre qui remplit les critères ne peut pas être « retiré » : il y
 * revient de lui-même. L'écran le dit au lieu de proposer un bouton inerte.
 */
export function DynamicGroupMembersPanel({
  groupId,
  groupName,
  onChanged,
}: {
  groupId: string;
  groupName: string;
  /** Appelé après un ajout ou un retrait, pour rafraîchir les compteurs. */
  onChanged: () => void;
}) {
  const { showToast } = useToast();
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const { data, loading, error, refetch } = useQuery<DynamicGroupMembersQueryData>(
    DYNAMIC_GROUP_MEMBERS,
    { variables: { dynamicGroupId: groupId }, fetchPolicy: 'cache-and-network' },
  );
  const { data: allData } = useQuery<MembersQueryData>(CLUB_MEMBERS, {
    skip: !adding,
  });
  const [addMembers, { loading: addingBusy }] = useMutation<{
    addMembersToDynamicGroup: number;
  }>(ADD_MEMBERS_TO_DYNAMIC_GROUP);
  const [removeMember, { loading: removing }] = useMutation<{
    removeMemberFromDynamicGroup: boolean;
  }>(REMOVE_MEMBER_FROM_DYNAMIC_GROUP);

  const rows = data?.dynamicGroupMembers ?? [];
  const inGroup = useMemo(() => new Set(rows.map((r) => r.memberId)), [rows]);

  /** Candidats : membres actifs du club qui ne sont pas déjà dans le groupe. */
  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (allData?.clubMembers ?? [])
      .filter((m) => m.status === 'ACTIVE' && !inGroup.has(m.id))
      .filter((m) =>
        q ? `${m.firstName} ${m.lastName}`.toLowerCase().includes(q) : true,
      )
      .sort((a, b) =>
        `${a.lastName} ${a.firstName}`.localeCompare(
          `${b.lastName} ${b.firstName}`,
          'fr',
        ),
      )
      .slice(0, 60);
  }, [allData, inGroup, search]);

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirmAdd() {
    if (picked.size === 0) return;
    try {
      const res = await addMembers({
        variables: { input: { dynamicGroupId: groupId, memberIds: [...picked] } },
      });
      const n = res.data?.addMembersToDynamicGroup ?? 0;
      showToast(
        n === 0
          ? 'Ces membres étaient déjà dans le groupe.'
          : `${n} membre${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''} à « ${groupName} ».`,
        'success',
      );
      setPicked(new Set());
      setSearch('');
      setAdding(false);
      await refetch();
      onChanged();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Ajout impossible.', 'error');
    }
  }

  async function remove(memberId: string, label: string) {
    try {
      await removeMember({
        variables: { input: { dynamicGroupId: groupId, memberId } },
      });
      showToast(`${label} retiré du groupe.`, 'success');
      await refetch();
      onChanged();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Retrait impossible.', 'error');
    }
  }

  return (
    <div className="dyn-group-members">
      <div className="dyn-group-members__head">
        <h3 className="family-drawer__h">
          <span className="material-symbols-outlined" aria-hidden>
            group
          </span>
          Membres du groupe{' '}
          <span className="muted">({rows.length})</span>
        </h3>
        {!adding ? (
          <button
            type="button"
            className="cf-btn cf-btn--primary cf-btn--sm"
            onClick={() => setAdding(true)}
          >
            <span className="material-symbols-outlined" aria-hidden>
              person_add
            </span>
            Ajouter des membres
          </button>
        ) : null}
      </div>
      <p className="muted dyn-group-members__hint">
        Les membres « par critères » y sont d'eux-mêmes (âge, grade) ; les
        membres « ajoutés » y restent quoi qu'il arrive, tant qu'on ne les
        retire pas.
      </p>

      {adding ? (
        <div className="dyn-group-picker">
          <label className="field dyn-group-picker__search">
            <span>Rechercher un membre à ajouter</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Prénom ou nom"
              autoFocus
            />
          </label>
          {!allData ? (
            <p className="muted">Chargement des membres…</p>
          ) : candidates.length === 0 ? (
            <p className="muted">
              {search.trim()
                ? 'Aucun membre actif ne correspond, ou il est déjà dans le groupe.'
                : 'Tous les membres actifs sont déjà dans ce groupe.'}
            </p>
          ) : (
            <ul className="dyn-group-picker__list">
              {candidates.map((m) => (
                <li key={m.id}>
                  <label className="dyn-group-picker__row">
                    <input
                      type="checkbox"
                      checked={picked.has(m.id)}
                      onChange={() => togglePick(m.id)}
                    />
                    <span className="dyn-group-picker__name">
                      {m.firstName} {m.lastName}
                    </span>
                    {m.gradeLevel?.label ? (
                      <span className="muted dyn-group-picker__meta">
                        {m.gradeLevel.label}
                      </span>
                    ) : null}
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="cf-form-actions">
            <button
              type="button"
              className="cf-btn cf-btn--ghost"
              onClick={() => {
                setAdding(false);
                setPicked(new Set());
                setSearch('');
              }}
              disabled={addingBusy}
            >
              Annuler
            </button>
            <button
              type="button"
              className="cf-btn cf-btn--primary"
              disabled={addingBusy || picked.size === 0}
              onClick={() => void confirmAdd()}
            >
              {addingBusy
                ? 'Ajout…'
                : picked.size === 0
                  ? 'Sélectionnez des membres'
                  : `Ajouter ${picked.size} membre${picked.size > 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      ) : null}

      {loading && rows.length === 0 ? (
        <p className="muted">Chargement…</p>
      ) : error ? (
        <p className="form-error">{error.message}</p>
      ) : rows.length === 0 ? (
        <p className="muted">
          Aucun membre pour l'instant : aucune fiche active ne remplit les
          critères, et personne n'a été ajouté à la main.
        </p>
      ) : (
        <ul className="dyn-group-members__list">
          {rows.map((r) => {
            const label = `${r.firstName} ${r.lastName}`;
            const removable = r.source === 'MANUAL';
            return (
              <li key={r.memberId} className="dyn-group-members__row">
                <span className="dyn-group-members__name">
                  <strong>{label}</strong>
                  {r.gradeLabel ? (
                    <span className="muted"> · {r.gradeLabel}</span>
                  ) : null}
                </span>
                <span
                  className={`dyn-group-members__source dyn-group-members__source--${r.source.toLowerCase()}`}
                  title={
                    r.source === 'BOTH'
                      ? 'Remplit les critères et a aussi été ajouté à la main'
                      : r.source === 'CRITERIA'
                        ? 'Remplit les critères du groupe'
                        : 'Ajouté à la main'
                  }
                >
                  {SOURCE_LABEL[r.source]}
                </span>
                {removable ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-tight dyn-group-members__remove"
                    disabled={removing}
                    onClick={() => void remove(r.memberId, label)}
                    aria-label={`Retirer ${label} du groupe`}
                    title="Retirer du groupe"
                  >
                    <span className="material-symbols-outlined" aria-hidden>
                      person_remove
                    </span>
                  </button>
                ) : r.source === 'BOTH' ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-tight dyn-group-members__remove"
                    disabled={removing}
                    onClick={() => void remove(r.memberId, label)}
                    aria-label={`Retirer l’ajout manuel de ${label} (reste par critères)`}
                    title="Retirer l’ajout manuel : reste dans le groupe par ses critères"
                  >
                    <span className="material-symbols-outlined" aria-hidden>
                      person_remove
                    </span>
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
