import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import {
  CLUB_ROLE_DEFINITIONS,
  CREATE_CLUB_ROLE_DEFINITION,
  DELETE_CLUB_ROLE_DEFINITION,
  UPDATE_CLUB_ROLE_DEFINITION,
} from '../../lib/documents';
import type { RoleDefinitionsQueryData } from '../../lib/types';

export function MembersRolesPage() {
  const [label, setLabel] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [msg, setMsg] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editSort, setEditSort] = useState('0');

  const { data, loading, error, refetch } =
    useQuery<RoleDefinitionsQueryData>(CLUB_ROLE_DEFINITIONS);

  const [createRole, { loading: creating }] = useMutation(
    CREATE_CLUB_ROLE_DEFINITION,
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

  const [updateRole, { loading: updating }] = useMutation(
    UPDATE_CLUB_ROLE_DEFINITION,
    {
      onCompleted: () => {
        setEditId(null);
        setMsg(null);
        void refetch();
      },
      onError: (e) => setMsg(e.message),
    },
  );

  const [deleteRole] = useMutation(DELETE_CLUB_ROLE_DEFINITION, {
    onCompleted: () => void refetch(),
    onError: (e) => setMsg(e.message),
  });

  const roles = data?.clubRoleDefinitions ?? [];

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!label.trim()) {
      setMsg('Libellé obligatoire.');
      return;
    }
    const so = Number.parseInt(sortOrder, 10);
    await createRole({
      variables: {
        input: {
          label: label.trim(),
          sortOrder: Number.isFinite(so) ? so : 0,
        },
      },
    });
  }

  function startEdit(r: RoleDefinitionsQueryData['clubRoleDefinitions'][0]) {
    setEditId(r.id);
    setEditLabel(r.label);
    setEditSort(String(r.sortOrder));
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
    await updateRole({
      variables: {
        input: {
          id: editId,
          label: editLabel.trim(),
          sortOrder: Number.isFinite(so) ? so : 0,
        },
      },
    });
  }

  async function onDelete(id: string, rLabel: string) {
    setMsg(null);
    if (
      !window.confirm(
        `Supprimer le rôle « ${rLabel} » ? Échec si des membres l’ont encore.`,
      )
    ) {
      return;
    }
    await deleteRole({ variables: { id } });
  }

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <p className="members-loom__eyebrow">Membres · Rôles</p>
        <h1 className="members-loom__title">Rôles personnalisés</h1>
        <p className="members-loom__lede">
          En complément des rôles système (STUDENT, COACH, BOARD), attribués
          dans l’annuaire. Le rôle « coach » reste requis pour le planning.
        </p>
      </header>

      <div className="members-manage">
        {msg ? <p className="form-error">{msg}</p> : null}
        {error ? <p className="form-error">{error.message}</p> : null}

        <section className="members-panel">
          <h2 className="members-panel__h">Créer un rôle</h2>
          <form className="members-form members-form--inline" onSubmit={(e) => void onCreate(e)}>
            <label className="field">
              <span>Libellé</span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="ex. Compétiteur, Bénévole accueil"
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
          ) : roles.length === 0 ? (
            <p className="muted">Aucun rôle personnalisé pour l’instant.</p>
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
                  {roles.map((r) =>
                    editId === r.id ? (
                      <tr key={r.id}>
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
                      <tr key={r.id}>
                        <td>{r.label}</td>
                        <td>{r.sortOrder}</td>
                        <td className="members-table__actions">
                          <button
                            type="button"
                            className="btn btn-ghost btn-tight"
                            onClick={() => startEdit(r)}
                          >
                            Modifier
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-tight members-table__danger"
                            onClick={() => void onDelete(r.id, r.label)}
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
