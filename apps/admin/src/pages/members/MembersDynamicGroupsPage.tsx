import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CLUB_DYNAMIC_GROUPS,
  CLUB_GRADE_LEVELS,
  CREATE_CLUB_DYNAMIC_GROUP,
  DELETE_CLUB_DYNAMIC_GROUP,
  UPDATE_CLUB_DYNAMIC_GROUP,
} from '../../lib/documents';
import type { DynamicGroupsQueryData, GradeLevelsQueryData } from '../../lib/types';
import { useClubModules } from '../../lib/club-modules-context';

type GroupRow = DynamicGroupsQueryData['clubDynamicGroups'][number];

export function MembersDynamicGroupsPage() {
  const [name, setName] = useState('');
  const [minAge, setMinAge] = useState('');
  const [maxAge, setMaxAge] = useState('');
  const [selectedGradeIds, setSelectedGradeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [msg, setMsg] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editMinAge, setEditMinAge] = useState('');
  const [editMaxAge, setEditMaxAge] = useState('');
  const [editGradeIds, setEditGradeIds] = useState<Set<string>>(
    () => new Set(),
  );

  const { isEnabled } = useClubModules();
  const membersOn = isEnabled('MEMBERS');

  const { data: gradesData } = useQuery<GradeLevelsQueryData>(
    CLUB_GRADE_LEVELS,
    { skip: !membersOn },
  );
  const grades = gradesData?.clubGradeLevels ?? [];

  const { data, loading, error, refetch } = useQuery<DynamicGroupsQueryData>(
    CLUB_DYNAMIC_GROUPS,
    { skip: !membersOn },
  );

  const [createGroup, { loading: creating }] = useMutation(
    CREATE_CLUB_DYNAMIC_GROUP,
    {
      onCompleted: () => {
        setName('');
        setMinAge('');
        setMaxAge('');
        setSelectedGradeIds(new Set());
        setMsg(null);
        void refetch();
      },
      onError: (e) => setMsg(e.message),
    },
  );

  const [updateGroup, { loading: updating }] = useMutation(
    UPDATE_CLUB_DYNAMIC_GROUP,
    {
      onCompleted: () => {
        setEditId(null);
        setMsg(null);
        void refetch();
      },
      onError: (e) => setMsg(e.message),
    },
  );

  const [deleteGroup] = useMutation(DELETE_CLUB_DYNAMIC_GROUP, {
    onCompleted: () => void refetch(),
    onError: (e) => setMsg(e.message),
  });

  const groups = data?.clubDynamicGroups ?? [];

  const gradeById = useMemo(() => new Map(grades.map((g) => [g.id, g])), [grades]);

  function parseOptionalAge(raw: string): number | null | undefined {
    const t = raw.trim();
    if (t === '') return undefined;
    const n = Number.parseInt(t, 10);
    if (!Number.isFinite(n)) return undefined;
    return n;
  }

  function gradeIdsPayload(set: Set<string>): string[] | undefined {
    if (set.size === 0) return undefined;
    return [...set];
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!name.trim()) {
      setMsg('Nom obligatoire.');
      return;
    }
    const min = parseOptionalAge(minAge);
    const max = parseOptionalAge(maxAge);
    await createGroup({
      variables: {
        input: {
          name: name.trim(),
          ...(min !== undefined ? { minAge: min } : {}),
          ...(max !== undefined ? { maxAge: max } : {}),
          gradeLevelIds: gradeIdsPayload(selectedGradeIds),
        },
      },
    });
  }

  function startEdit(g: GroupRow) {
    setEditId(g.id);
    setEditName(g.name);
    setEditMinAge(g.minAge != null ? String(g.minAge) : '');
    setEditMaxAge(g.maxAge != null ? String(g.maxAge) : '');
    setEditGradeIds(new Set(g.gradeFilters.map((gf) => gf.id)));
    setMsg(null);
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    setMsg(null);
    if (!editName.trim()) {
      setMsg('Nom obligatoire.');
      return;
    }
    const min = parseOptionalAge(editMinAge);
    const max = parseOptionalAge(editMaxAge);
    await updateGroup({
      variables: {
        input: {
          id: editId,
          name: editName.trim(),
          minAge: min ?? null,
          maxAge: max ?? null,
          gradeLevelIds:
            editGradeIds.size === 0 ? [] : [...editGradeIds],
        },
      },
    });
  }

  async function onDelete(id: string, gName: string) {
    setMsg(null);
    if (
      !window.confirm(
        `Supprimer le groupe « ${gName} » ? Impossible s’il est encore lié (formule, créneau…).`,
      )
    ) {
      return;
    }
    try {
      await deleteGroup({ variables: { id } });
    } catch {
      /* onError déjà */
    }
  }

  function toggleGrade(
    setFn: React.Dispatch<React.SetStateAction<Set<string>>>,
    id: string,
  ) {
    setFn((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!membersOn) {
    return (
      <>
        <header className="members-loom__hero members-loom__hero--nested">
          <p className="members-loom__eyebrow">Membres · Groupes dynamiques</p>
          <h1 className="members-loom__title">Module désactivé</h1>
          <p className="members-loom__lede">
            Activez le module « Membres » pour gérer les groupes (adhésion,
            planning, communication).
          </p>
        </header>
        <p>
          <Link to="/club-modules">Modules du club</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <p className="members-loom__eyebrow">Membres · Groupes dynamiques</p>
        <h1 className="members-loom__title">Groupes dynamiques</h1>
        <p className="members-loom__lede">
          Critères âge et grades pour l’annuaire, le planning, les cotisations.
          Aucun grade coché = tous les grades.
        </p>
      </header>

      <div className="members-manage">
        {msg ? <p className="form-error">{msg}</p> : null}
        {error ? <p className="form-error">{error.message}</p> : null}

        <section className="members-panel">
          <h2 className="members-panel__h">Ajouter un groupe</h2>
          <form
            className="members-form"
            onSubmit={(e) => void onCreate(e)}
          >
            <div className="members-form members-form--inline">
              <label className="field">
                <span>Nom</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ex. Enfants"
                />
              </label>
              <label className="field">
                <span>Âge min</span>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={minAge}
                  onChange={(e) => setMinAge(e.target.value)}
                  placeholder="optionnel"
                />
              </label>
              <label className="field">
                <span>Âge max</span>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={maxAge}
                  onChange={(e) => setMaxAge(e.target.value)}
                  placeholder="optionnel"
                />
              </label>
            </div>
            <div className="members-form__fieldset">
              <span className="members-form__legend">Grades (optionnel)</span>
              <div className="members-checkbox-grid">
                {grades.map((gl) => (
                  <label key={gl.id} className="members-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedGradeIds.has(gl.id)}
                      onChange={() =>
                        toggleGrade(setSelectedGradeIds, gl.id)
                      }
                    />
                    <span>{gl.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? '…' : 'Créer'}
            </button>
          </form>
        </section>

        <section className="members-panel members-panel--table">
          <h2 className="members-panel__h">Liste</h2>
          {loading ? (
            <p className="muted">Chargement…</p>
          ) : groups.length === 0 ? (
            <p className="muted">Aucun groupe. Créez-en un ci-dessus.</p>
          ) : (
            <div className="members-table-wrap">
              <table className="members-table">
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Âges</th>
                    <th>Grades</th>
                    <th>Effectif (matching)</th>
                    <th aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) =>
                    editId === g.id ? (
                      <tr key={g.id}>
                        <td colSpan={5}>
                          <form
                            className="members-form"
                            onSubmit={(e) => void onUpdate(e)}
                          >
                            <div className="members-form members-form--inline">
                              <label className="field">
                                <span>Nom</span>
                                <input
                                  value={editName}
                                  onChange={(e) =>
                                    setEditName(e.target.value)
                                  }
                                />
                              </label>
                              <label className="field">
                                <span>Âge min</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={120}
                                  value={editMinAge}
                                  onChange={(e) =>
                                    setEditMinAge(e.target.value)
                                  }
                                />
                              </label>
                              <label className="field">
                                <span>Âge max</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={120}
                                  value={editMaxAge}
                                  onChange={(e) =>
                                    setEditMaxAge(e.target.value)
                                  }
                                />
                              </label>
                            </div>
                            <div className="members-form__fieldset">
                              <span className="members-form__legend">Grades</span>
                              <div className="members-checkbox-grid">
                                {grades.map((gl) => (
                                  <label key={gl.id} className="members-checkbox">
                                    <input
                                      type="checkbox"
                                      checked={editGradeIds.has(gl.id)}
                                      onChange={() =>
                                        toggleGrade(setEditGradeIds, gl.id)
                                      }
                                    />
                                    <span>{gl.label}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                            <button
                              type="submit"
                              className="btn btn-primary"
                              disabled={updating}
                            >
                              Enregistrer
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => setEditId(null)}
                            >
                              Fermer
                            </button>
                          </form>
                        </td>
                      </tr>
                    ) : (
                      <tr key={g.id}>
                        <td>{g.name}</td>
                        <td>
                          {g.minAge ?? '—'} — {g.maxAge ?? '—'}
                        </td>
                        <td>
                          {g.gradeFilters.length === 0
                            ? 'Tous'
                            : g.gradeFilters
                                .map((gf) => gradeById.get(gf.id)?.label ?? gf.id)
                                .join(', ')}
                        </td>
                        <td>{g.matchingActiveMembersCount}</td>
                        <td className="members-table__actions">
                          <button
                            type="button"
                            className="btn btn-ghost btn-tight"
                            onClick={() => startEdit(g)}
                          >
                            Modifier
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-tight members-table__danger"
                            onClick={() => void onDelete(g.id, g.name)}
                          >
                            Supprimer
                          </button>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
