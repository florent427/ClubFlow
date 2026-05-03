import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  CLUB_GRADE_LEVELS,
  CLUB_MEMBERS,
  CREATE_CLUB_GRADE_LEVEL,
  DELETE_CLUB_GRADE_LEVEL,
  UPDATE_CLUB_GRADE_LEVEL,
} from '../../lib/documents';
import type { GradeLevelsQueryData, MembersQueryData } from '../../lib/types';

export function MembersGradesPage() {
  const [label, setLabel] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [msg, setMsg] = useState<string | null>(null);

  /** État d'édition : id + champs tampons. Rendu dans une modale au-dessus
   * de la liste pour ne pas fracturer la mise en forme verticale. */
  const [editing, setEditing] =
    useState<GradeLevelsQueryData['clubGradeLevels'][number] | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editSort, setEditSort] = useState('0');

  const { data, loading, error, refetch } =
    useQuery<GradeLevelsQueryData>(CLUB_GRADE_LEVELS);
  /**
   * On pige aussi les membres pour afficher l'effectif de chaque grade.
   * Donnée déjà cachée par Apollo (MembersDirectoryPage la charge aussi),
   * donc zéro round-trip supplémentaire dans la majorité des cas.
   */
  const { data: membersData } = useQuery<MembersQueryData>(CLUB_MEMBERS, {
    fetchPolicy: 'cache-first',
  });

  const [createGrade, { loading: creating }] = useMutation(
    CREATE_CLUB_GRADE_LEVEL,
    {
      onCompleted: () => {
        setLabel('');
        setSortOrder('0');
        setMsg(null);
        void refetch();
      },
      onError: (e) => setMsg(e.message),
    },
  );

  const [updateGrade, { loading: updating }] = useMutation(
    UPDATE_CLUB_GRADE_LEVEL,
    {
      onCompleted: () => {
        setEditing(null);
        setMsg(null);
        void refetch();
      },
      onError: (e) => setMsg(e.message),
    },
  );

  const [deleteGrade] = useMutation(DELETE_CLUB_GRADE_LEVEL, {
    onCompleted: () => void refetch(),
    onError: (e) => setMsg(e.message),
  });

  const grades = data?.clubGradeLevels ?? [];
  /** Comptage membres par grade — utilisé pour la pastille d'effectif. */
  const membersByGradeId = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of membersData?.clubMembers ?? []) {
      if (m.status !== 'ACTIVE' || !m.gradeLevelId) continue;
      map.set(m.gradeLevelId, (map.get(m.gradeLevelId) ?? 0) + 1);
    }
    return map;
  }, [membersData]);

  const totalAssigned = useMemo(
    () =>
      Array.from(membersByGradeId.values()).reduce((s, n) => s + n, 0),
    [membersByGradeId],
  );

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!label.trim()) {
      setMsg('Libellé obligatoire.');
      return;
    }
    const so = Number.parseInt(sortOrder, 10);
    await createGrade({
      variables: {
        input: {
          label: label.trim(),
          sortOrder: Number.isFinite(so) ? so : 0,
        },
      },
    });
  }

  function startEdit(g: GradeLevelsQueryData['clubGradeLevels'][number]) {
    setEditing(g);
    setEditLabel(g.label);
    setEditSort(String(g.sortOrder));
    setMsg(null);
  }

  async function onUpdate(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setMsg(null);
    if (!editLabel.trim()) {
      setMsg('Libellé obligatoire.');
      return;
    }
    const so = Number.parseInt(editSort, 10);
    await updateGrade({
      variables: {
        input: {
          id: editing.id,
          label: editLabel.trim(),
          sortOrder: Number.isFinite(so) ? so : 0,
        },
      },
    });
  }

  async function onDelete(id: string, gLabel: string) {
    setMsg(null);
    if (
      !window.confirm(
        `Supprimer le grade « ${gLabel} » ? Impossible s’il est encore utilisé.`,
      )
    ) {
      return;
    }
    await deleteGrade({ variables: { id } });
  }

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <div className="members-hero__actions">
          <div>
            <p className="members-loom__eyebrow">Membres · Grades</p>
            <h1 className="members-loom__title">Niveaux et ceintures</h1>
            <p className="members-loom__lede">
              Référentiel ordonné utilisé par les fiches membres, les groupes
              dynamiques et le planning. Plus l’ordre est petit, plus le grade
              est affiché haut dans les listes.
            </p>
          </div>
        </div>
      </header>

      {/* KPI row : panorama rapide */}
      {grades.length > 0 ? (
        <div className="members-kpis grades-kpis">
          <div className="members-kpi">
            <span className="members-kpi__label">Grades</span>
            <span className="members-kpi__value">{grades.length}</span>
            <span className="members-kpi__hint">définis dans ce club</span>
          </div>
          <div className="members-kpi">
            <span className="members-kpi__label">Membres assignés</span>
            <span className="members-kpi__value">{totalAssigned}</span>
            <span className="members-kpi__hint">
              sur {membersData?.clubMembers?.filter((m) => m.status === 'ACTIVE').length ?? 0} actifs
            </span>
          </div>
        </div>
      ) : null}

      <div className="members-manage grades-layout">
        {msg ? <p className="form-error">{msg}</p> : null}
        {error ? <p className="form-error">{error.message}</p> : null}

        {/* Form ajout : card compacte à gauche */}
        <section className="members-panel grades-form-panel">
          <h2 className="members-panel__h">
            <span className="material-symbols-outlined" aria-hidden>
              add_circle
            </span>
            Ajouter un grade
          </h2>
          <p className="cf-text-muted grades-form-panel__lede">
            Chaque grade occupe une place dans l’ordre (0 = premier).
          </p>
          <form
            className="members-form grades-form"
            onSubmit={(e) => void onCreate(e)}
          >
            <label className="field">
              <span>Libellé</span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="ex. Ceinture bleue"
                autoFocus
              />
            </label>
            <label className="field">
              <span>Ordre d’affichage</span>
              <input
                type="number"
                min={0}
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
            </label>
            <button
              type="submit"
              className="cf-btn cf-btn--primary grades-form__submit"
              disabled={creating}
            >
              {creating ? 'Création…' : 'Créer le grade'}
            </button>
          </form>
        </section>

        {/* Liste ordonnée : cartes avec numéro coloré */}
        <section className="members-panel grades-list-panel">
          <h2 className="members-panel__h">
            <span className="material-symbols-outlined" aria-hidden>
              military_tech
            </span>
            Classement ({grades.length})
          </h2>
          {loading ? (
            <p className="cf-text-muted">Chargement…</p>
          ) : grades.length === 0 ? (
            <div className="grades-empty">
              <span className="material-symbols-outlined" aria-hidden>
                military_tech
              </span>
              <p>
                <strong>Aucun grade défini</strong>
                <br />
                <small>
                  Ajoutez votre premier niveau à gauche (ex. Ceinture blanche).
                </small>
              </p>
            </div>
          ) : (
            <ol className="grades-list">
              {grades.map((g, index) => {
                const count = membersByGradeId.get(g.id) ?? 0;
                return (
                  <li key={g.id} className="grades-card">
                    <div className="grades-card__rank">
                      <span className="grades-card__rank-num">{index + 1}</span>
                      <span className="grades-card__rank-label">
                        Ordre {g.sortOrder}
                      </span>
                    </div>
                    <div className="grades-card__body">
                      <strong className="grades-card__label">{g.label}</strong>
                      <span
                        className={`grades-card__count${count === 0 ? ' grades-card__count--zero' : ''}`}
                      >
                        <span
                          className="material-symbols-outlined"
                          aria-hidden
                        >
                          person
                        </span>
                        {count} membre{count > 1 ? 's' : ''} actif
                        {count > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="grades-card__actions">
                      <button
                        type="button"
                        className="cf-btn cf-btn--sm cf-btn--ghost"
                        onClick={() => startEdit(g)}
                        title="Modifier ce grade"
                      >
                        <span
                          className="material-symbols-outlined"
                          aria-hidden
                        >
                          edit
                        </span>
                      </button>
                      <button
                        type="button"
                        className="cf-btn cf-btn--sm cf-btn--ghost cf-btn--danger"
                        onClick={() => void onDelete(g.id, g.label)}
                        title="Supprimer ce grade"
                        disabled={count > 0}
                        aria-disabled={count > 0}
                      >
                        <span
                          className="material-symbols-outlined"
                          aria-hidden
                        >
                          delete
                        </span>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>

      {/* Modale édition : positionnée via .cf-modal, respect des autres pages */}
      {editing ? (
        <>
          <div
            className="cf-modal-backdrop"
            role="presentation"
            onClick={() => setEditing(null)}
          />
          <div
            className="cf-modal cf-modal--confirm grades-edit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="grade-edit-title"
          >
            <h2 id="grade-edit-title" className="cf-modal-title">
              Modifier « {editing.label} »
            </h2>
            <form onSubmit={(e) => void onUpdate(e)} className="members-form">
              <label className="field">
                <span>Libellé</span>
                <input
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  autoFocus
                />
              </label>
              <label className="field">
                <span>Ordre d’affichage</span>
                <input
                  type="number"
                  min={0}
                  value={editSort}
                  onChange={(e) => setEditSort(e.target.value)}
                />
              </label>
              <div className="cf-modal-actions">
                <button
                  type="button"
                  className="cf-btn cf-btn--ghost"
                  onClick={() => setEditing(null)}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="cf-btn cf-btn--primary"
                  disabled={updating}
                >
                  {updating ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </>
      ) : null}
    </>
  );
}
