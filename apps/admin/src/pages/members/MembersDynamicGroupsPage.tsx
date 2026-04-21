import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useMemo, useState } from 'react';
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
type GradeRow = GradeLevelsQueryData['clubGradeLevels'][number];

type FormState = {
  name: string;
  minAge: string;
  maxAge: string;
  gradeIds: Set<string>;
};

const EMPTY_FORM: FormState = {
  name: '',
  minAge: '',
  maxAge: '',
  gradeIds: new Set(),
};

function parseOptionalAge(raw: string): number | null | undefined {
  const t = raw.trim();
  if (t === '') return undefined;
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function GroupForm({
  mode,
  initial,
  grades,
  submitting,
  onSubmit,
  onCancel,
  previewCount,
}: {
  mode: 'create' | 'edit';
  initial: FormState;
  grades: GradeRow[];
  submitting: boolean;
  onSubmit: (f: FormState) => void;
  onCancel?: () => void;
  previewCount?: number | null;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [localError, setLocalError] = useState<string | null>(null);

  // Re-sync state when initial changes (switch between edit targets)
  useEffect(() => {
    setForm({
      name: initial.name,
      minAge: initial.minAge,
      maxAge: initial.maxAge,
      gradeIds: new Set(initial.gradeIds),
    });
    setLocalError(null);
  }, [initial]);

  function toggleGrade(id: string) {
    setForm((prev) => {
      const next = new Set(prev.gradeIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, gradeIds: next };
    });
  }

  function selectAllGrades() {
    setForm((prev) => ({
      ...prev,
      gradeIds: new Set(grades.map((g) => g.id)),
    }));
  }

  function clearGrades() {
    setForm((prev) => ({ ...prev, gradeIds: new Set() }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (!form.name.trim()) {
      setLocalError('Le nom est obligatoire.');
      return;
    }
    const min = parseOptionalAge(form.minAge);
    const max = parseOptionalAge(form.maxAge);
    if (min != null && max != null && min > max) {
      setLocalError('Âge min doit être ≤ âge max.');
      return;
    }
    onSubmit(form);
  }

  const ageLabel = (() => {
    const hasMin = form.minAge.trim() !== '';
    const hasMax = form.maxAge.trim() !== '';
    if (!hasMin && !hasMax) return 'Tous les âges';
    if (hasMin && hasMax) return `${form.minAge} — ${form.maxAge} ans`;
    if (hasMin) return `${form.minAge} ans et plus`;
    return `${form.maxAge} ans et moins`;
  })();

  const gradeCount = form.gradeIds.size;

  return (
    <form className="dyn-group-form" onSubmit={handleSubmit}>
      {localError ? <p className="form-error">{localError}</p> : null}

      <fieldset className="dyn-group-form__section">
        <legend className="dyn-group-form__legend">Identité</legend>
        <label className="field">
          <span>Nom du groupe</span>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="ex. Enfants ceintures blanches"
            autoFocus={mode === 'edit'}
          />
        </label>
      </fieldset>

      <fieldset className="dyn-group-form__section">
        <legend className="dyn-group-form__legend">
          Tranche d’âge <span className="muted">· {ageLabel}</span>
        </legend>
        <div className="dyn-group-form__row">
          <label className="field">
            <span>Âge min</span>
            <input
              type="number"
              min={0}
              max={120}
              value={form.minAge}
              onChange={(e) => setForm({ ...form, minAge: e.target.value })}
              placeholder="—"
            />
          </label>
          <label className="field">
            <span>Âge max</span>
            <input
              type="number"
              min={0}
              max={120}
              value={form.maxAge}
              onChange={(e) => setForm({ ...form, maxAge: e.target.value })}
              placeholder="—"
            />
          </label>
        </div>
        <p className="dyn-group-form__hint">
          Laissez vide pour « sans limite » de ce côté.
        </p>
      </fieldset>

      <fieldset className="dyn-group-form__section">
        <legend className="dyn-group-form__legend">
          Grades ciblés{' '}
          <span className="muted">
            ·{' '}
            {gradeCount === 0
              ? 'Tous les grades'
              : `${gradeCount} sélectionné${gradeCount > 1 ? 's' : ''}`}
          </span>
        </legend>
        <div className="dyn-group-form__grade-actions">
          <button
            type="button"
            className="btn btn-ghost btn-tight"
            onClick={selectAllGrades}
          >
            Tout cocher
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-tight"
            onClick={clearGrades}
          >
            Tout décocher
          </button>
        </div>
        <div className="dyn-group-form__grades">
          {grades.length === 0 ? (
            <p className="muted">Aucun grade configuré.</p>
          ) : (
            grades.map((gl) => (
              <label
                key={gl.id}
                className={
                  form.gradeIds.has(gl.id)
                    ? 'dyn-group-chip dyn-group-chip--active'
                    : 'dyn-group-chip'
                }
              >
                <input
                  type="checkbox"
                  checked={form.gradeIds.has(gl.id)}
                  onChange={() => toggleGrade(gl.id)}
                />
                <span>{gl.label}</span>
              </label>
            ))
          )}
        </div>
      </fieldset>

      {previewCount != null ? (
        <p className="dyn-group-form__preview">
          <strong>{previewCount}</strong> membre{previewCount > 1 ? 's' : ''}{' '}
          correspondent actuellement à ces critères.
        </p>
      ) : null}

      <div className="dyn-group-form__actions">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? '…' : mode === 'create' ? 'Créer le groupe' : 'Enregistrer'}
        </button>
        {onCancel ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onCancel}
            disabled={submitting}
          >
            Annuler
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function MembersDynamicGroupsPage() {
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<GroupRow | null>(null);

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
        setEditing(null);
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

  async function handleCreate(form: FormState) {
    setMsg(null);
    const min = parseOptionalAge(form.minAge);
    const max = parseOptionalAge(form.maxAge);
    await createGroup({
      variables: {
        input: {
          name: form.name.trim(),
          ...(min !== undefined ? { minAge: min } : {}),
          ...(max !== undefined ? { maxAge: max } : {}),
          gradeLevelIds: form.gradeIds.size === 0 ? undefined : [...form.gradeIds],
        },
      },
    });
  }

  async function handleUpdate(form: FormState) {
    if (!editing) return;
    setMsg(null);
    const min = parseOptionalAge(form.minAge);
    const max = parseOptionalAge(form.maxAge);
    await updateGroup({
      variables: {
        input: {
          id: editing.id,
          name: form.name.trim(),
          minAge: min ?? null,
          maxAge: max ?? null,
          gradeLevelIds: form.gradeIds.size === 0 ? [] : [...form.gradeIds],
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
      if (editing?.id === id) setEditing(null);
    } catch {
      /* onError déjà géré */
    }
  }

  const editInitial: FormState | null = editing
    ? {
        name: editing.name,
        minAge: editing.minAge != null ? String(editing.minAge) : '',
        maxAge: editing.maxAge != null ? String(editing.maxAge) : '',
        gradeIds: new Set(editing.gradeFilters.map((gf) => gf.id)),
      }
    : null;

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
          Ciblez des membres par âge et par grade pour l’annuaire, le planning,
          les cotisations et la communication.
        </p>
      </header>

      <div className="members-manage">
        {msg ? <p className="form-error">{msg}</p> : null}
        {error ? <p className="form-error">{error.message}</p> : null}

        <div className="dyn-group-layout">
          <section className="members-panel dyn-group-panel">
            <h2 className="members-panel__h">Nouveau groupe</h2>
            <p className="muted dyn-group-panel__lede">
              Les critères sont combinés en « ET ». Sans grade coché =
              tous les grades.
            </p>
            <GroupForm
              mode="create"
              initial={EMPTY_FORM}
              grades={grades}
              submitting={creating}
              onSubmit={(f) => void handleCreate(f)}
            />
          </section>

          <section className="members-panel members-panel--table dyn-group-panel">
            <h2 className="members-panel__h">
              Groupes existants{' '}
              <span className="muted">({groups.length})</span>
            </h2>
            {loading ? (
              <p className="muted">Chargement…</p>
            ) : groups.length === 0 ? (
              <p className="muted">
                Aucun groupe pour le moment. Créez-en un à gauche.
              </p>
            ) : (
              <div className="members-table-wrap">
                <table className="members-table">
                  <thead>
                    <tr>
                      <th>Nom</th>
                      <th>Âges</th>
                      <th>Grades</th>
                      <th>Effectif</th>
                      <th aria-hidden />
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => (
                      <tr
                        key={g.id}
                        className={
                          editing?.id === g.id
                            ? 'members-table__row--clickable dyn-group-row--active'
                            : 'members-table__row--clickable'
                        }
                      >
                        <td>
                          <button
                            type="button"
                            className="link-like"
                            onClick={() => setEditing(g)}
                          >
                            {g.name}
                          </button>
                        </td>
                        <td>
                          {g.minAge == null && g.maxAge == null
                            ? 'Tous'
                            : `${g.minAge ?? '—'} — ${g.maxAge ?? '—'}`}
                        </td>
                        <td>
                          {g.gradeFilters.length === 0
                            ? 'Tous'
                            : g.gradeFilters
                                .map(
                                  (gf) =>
                                    gradeById.get(gf.id)?.label ?? gf.id,
                                )
                                .join(', ')}
                        </td>
                        <td>
                          <strong>{g.matchingActiveMembersCount}</strong>
                        </td>
                        <td className="members-table__actions">
                          <button
                            type="button"
                            className="btn btn-ghost btn-tight"
                            onClick={() => setEditing(g)}
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
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>

      {editing && editInitial ? (
        <>
          <div
            className="family-drawer-backdrop"
            onClick={() => setEditing(null)}
            aria-hidden
          />
          <aside
            className="family-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={`Modifier le groupe ${editing.name}`}
          >
            <header className="family-drawer__head">
              <div>
                <p className="members-loom__eyebrow">Groupe dynamique</p>
                <h2 className="family-drawer__title">{editing.name}</h2>
              </div>
              <div className="family-drawer__head-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-tight"
                  onClick={() => setEditing(null)}
                >
                  Fermer
                </button>
              </div>
            </header>
            <div className="family-drawer__section">
              <GroupForm
                mode="edit"
                initial={editInitial}
                grades={grades}
                submitting={updating}
                onSubmit={(f) => void handleUpdate(f)}
                onCancel={() => setEditing(null)}
                previewCount={editing.matchingActiveMembersCount}
              />
            </div>
          </aside>
        </>
      ) : null}
    </>
  );
}
