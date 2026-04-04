import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import {
  CLUB_GRADE_LEVELS,
  CREATE_CLUB_GRADE_LEVEL,
  DELETE_CLUB_GRADE_LEVEL,
  UPDATE_CLUB_GRADE_LEVEL,
} from '../../lib/documents';
import type { GradeLevelsQueryData } from '../../lib/types';

export function MembersGradesPage() {
  const [label, setLabel] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [msg, setMsg] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editSort, setEditSort] = useState('0');

  const { data, loading, error, refetch } =
    useQuery<GradeLevelsQueryData>(CLUB_GRADE_LEVELS);

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
        setEditId(null);
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

  async function onCreate(e: React.FormEvent) {
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

  function startEdit(g: GradeLevelsQueryData['clubGradeLevels'][0]) {
    setEditId(g.id);
    setEditLabel(g.label);
    setEditSort(String(g.sortOrder));
    setMsg(null);
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    setMsg(null);
    if (!editLabel.trim()) {
      setMsg('Libellé obligatoire.');
      return;
    }
    const so = Number.parseInt(editSort, 10);
    await updateGrade({
      variables: {
        input: {
          id: editId,
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
        <p className="members-loom__eyebrow">Membres · Grades</p>
        <h1 className="members-loom__title">Niveaux et ceintures</h1>
        <p className="members-loom__lede">
          Ordre d’affichage via le champ « ordre » (tri croissant).
        </p>
      </header>

      <div className="members-manage">
        {msg ? <p className="form-error">{msg}</p> : null}
        {error ? <p className="form-error">{error.message}</p> : null}

        <section className="members-panel">
          <h2 className="members-panel__h">Ajouter un grade</h2>
          <form className="members-form members-form--inline" onSubmit={(e) => void onCreate(e)}>
            <label className="field">
              <span>Libellé</span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="ex. Ceinture bleue"
              />
            </label>
            <label className="field">
              <span>Ordre</span>
              <input
                type="number"
                min={0}
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
            </label>
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? '…' : 'Créer'}
            </button>
          </form>
        </section>

        <section className="members-panel members-panel--table">
          <h2 className="members-panel__h">Liste</h2>
          {loading ? (
            <p className="muted">Chargement…</p>
          ) : grades.length === 0 ? (
            <p className="muted">Aucun grade. Créez-en un ci-dessus.</p>
          ) : (
            <div className="members-table-wrap">
              <table className="members-table">
                <thead>
                  <tr>
                    <th>Libellé</th>
                    <th>Ordre</th>
                    <th aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {grades.map((g) =>
                    editId === g.id ? (
                      <tr key={g.id}>
                        <td colSpan={3}>
                          <form
                            className="members-form members-form--inline"
                            onSubmit={(e) => void onUpdate(e)}
                          >
                            <label className="field">
                              <span>Libellé</span>
                              <input
                                value={editLabel}
                                onChange={(e) => setEditLabel(e.target.value)}
                              />
                            </label>
                            <label className="field">
                              <span>Ordre</span>
                              <input
                                type="number"
                                min={0}
                                value={editSort}
                                onChange={(e) => setEditSort(e.target.value)}
                              />
                            </label>
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
                        <td>{g.label}</td>
                        <td>{g.sortOrder}</td>
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
                            onClick={() => void onDelete(g.id, g.label)}
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
