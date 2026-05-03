import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  CLUB_MEMBERS,
  CLUB_ROLE_DEFINITIONS,
  CREATE_CLUB_ROLE_DEFINITION,
  DELETE_CLUB_ROLE_DEFINITION,
  UPDATE_CLUB_ROLE_DEFINITION,
} from '../../lib/documents';
import type { MembersQueryData, RoleDefinitionsQueryData } from '../../lib/types';
import { BUILTIN_ROLE_OPTIONS } from './members-constants';

/** Rôles système — en lecture seule, documentés pour que l'admin comprenne
 * qu'il complète ces rôles avec ses propres libellés. */
const BUILTIN_ROLE_DESCRIPTIONS: Record<
  (typeof BUILTIN_ROLE_OPTIONS)[number]['value'],
  { description: string; icon: string }
> = {
  STUDENT: {
    description: 'Rôle par défaut des membres qui pratiquent.',
    icon: 'school',
  },
  COACH: {
    description: 'Requis pour apparaître comme professeur dans le planning.',
    icon: 'sports',
  },
  BOARD: {
    description: 'Membres du bureau (président, trésorier, secrétaire…).',
    icon: 'gavel',
  },
};

export function MembersRolesPage() {
  const [label, setLabel] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [msg, setMsg] = useState<string | null>(null);

  /** État d'édition : id + champs tampons. Rendu dans une modale. */
  const [editing, setEditing] =
    useState<RoleDefinitionsQueryData['clubRoleDefinitions'][number] | null>(
      null,
    );
  const [editLabel, setEditLabel] = useState('');
  const [editSort, setEditSort] = useState('0');

  const { data, loading, error, refetch } =
    useQuery<RoleDefinitionsQueryData>(CLUB_ROLE_DEFINITIONS);
  /** Membres pour compter les assignations par rôle custom + builtin. */
  const { data: membersData } = useQuery<MembersQueryData>(CLUB_MEMBERS, {
    fetchPolicy: 'cache-first',
  });

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
        setEditing(null);
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
  const members = membersData?.clubMembers ?? [];

  /** Compte membres actifs par clé de rôle (builtin string, ou custom id). */
  const countsByKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of members) {
      if (m.status !== 'ACTIVE') continue;
      for (const r of m.roles) {
        map.set(r, (map.get(r) ?? 0) + 1);
      }
      for (const r of m.customRoles) {
        const k = `custom:${r.id}`;
        map.set(k, (map.get(k) ?? 0) + 1);
      }
    }
    return map;
  }, [members]);

  async function onCreate(e: FormEvent) {
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

  function startEdit(r: RoleDefinitionsQueryData['clubRoleDefinitions'][number]) {
    setEditing(r);
    setEditLabel(r.label);
    setEditSort(String(r.sortOrder));
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
    await updateRole({
      variables: {
        input: {
          id: editing.id,
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
        <div className="members-hero__actions">
          <div>
            <p className="members-loom__eyebrow">Membres · Rôles</p>
            <h1 className="members-loom__title">Rôles personnalisés</h1>
            <p className="members-loom__lede">
              En complément des rôles système (STUDENT, COACH, BOARD) attribués
              dans l’annuaire, créez vos propres libellés (ex. Compétiteur,
              Bénévole accueil…).
            </p>
          </div>
        </div>
      </header>

      {/* KPI row */}
      {roles.length > 0 || members.length > 0 ? (
        <div className="members-kpis roles-kpis">
          <div className="members-kpi">
            <span className="members-kpi__label">Rôles personnalisés</span>
            <span className="members-kpi__value">{roles.length}</span>
            <span className="members-kpi__hint">en plus des 3 rôles système</span>
          </div>
          <div className="members-kpi">
            <span className="members-kpi__label">Membres assignés</span>
            <span className="members-kpi__value">
              {
                members.filter(
                  (m) =>
                    m.status === 'ACTIVE' &&
                    (m.roles.length > 0 || m.customRoles.length > 0),
                ).length
              }
            </span>
            <span className="members-kpi__hint">
              actifs avec au moins un rôle
            </span>
          </div>
        </div>
      ) : null}

      <div className="members-manage roles-layout">
        {msg ? <p className="form-error">{msg}</p> : null}
        {error ? <p className="form-error">{error.message}</p> : null}

        {/* Form création + rappel rôles système à gauche */}
        <aside className="roles-sidebar">
          <section className="members-panel roles-form-panel">
            <h2 className="members-panel__h">
              <span className="material-symbols-outlined" aria-hidden>
                add_circle
              </span>
              Nouveau rôle
            </h2>
            <p className="cf-text-muted roles-form-panel__lede">
              Libellé visible dans les fiches membres et les filtres annuaire.
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
                  placeholder="ex. Compétiteur"
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
                {creating ? 'Création…' : 'Créer le rôle'}
              </button>
            </form>
          </section>

          {/* Rôles système pour contexte */}
          <section className="members-panel roles-builtin-panel">
            <h3 className="roles-builtin-panel__h">
              <span className="material-symbols-outlined" aria-hidden>
                shield
              </span>
              Rôles système (lecture seule)
            </h3>
            <ul className="roles-builtin-list">
              {BUILTIN_ROLE_OPTIONS.map((b) => {
                const def = BUILTIN_ROLE_DESCRIPTIONS[b.value];
                const count = countsByKey.get(b.value) ?? 0;
                return (
                  <li key={b.value} className="roles-builtin-item">
                    <span
                      className="material-symbols-outlined roles-builtin-item__icon"
                      aria-hidden
                    >
                      {def.icon}
                    </span>
                    <div className="roles-builtin-item__body">
                      <strong>{b.label}</strong>
                      <small>{def.description}</small>
                    </div>
                    <span className="roles-builtin-item__count">
                      <span className="material-symbols-outlined" aria-hidden>
                        person
                      </span>
                      {count}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>

        {/* Liste rôles custom à droite */}
        <section className="members-panel roles-list-panel">
          <h2 className="members-panel__h">
            <span className="material-symbols-outlined" aria-hidden>
              badge
            </span>
            Vos rôles personnalisés ({roles.length})
          </h2>
          {loading ? (
            <p className="cf-text-muted">Chargement…</p>
          ) : roles.length === 0 ? (
            <div className="grades-empty">
              <span className="material-symbols-outlined" aria-hidden>
                badge
              </span>
              <p>
                <strong>Aucun rôle personnalisé</strong>
                <br />
                <small>
                  Créez votre premier rôle à gauche (ex. Compétiteur, Bénévole…).
                </small>
              </p>
            </div>
          ) : (
            <ol className="grades-list">
              {roles.map((r, index) => {
                const count = countsByKey.get(`custom:${r.id}`) ?? 0;
                return (
                  <li key={r.id} className="grades-card roles-card">
                    <div className="grades-card__rank">
                      <span className="grades-card__rank-num">{index + 1}</span>
                      <span className="grades-card__rank-label">
                        Ordre {r.sortOrder}
                      </span>
                    </div>
                    <div className="grades-card__body">
                      <strong className="grades-card__label">{r.label}</strong>
                      <span
                        className={`grades-card__count${count === 0 ? ' grades-card__count--zero' : ''}`}
                      >
                        <span className="material-symbols-outlined" aria-hidden>
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
                        onClick={() => startEdit(r)}
                        title="Modifier ce rôle"
                      >
                        <span className="material-symbols-outlined" aria-hidden>
                          edit
                        </span>
                      </button>
                      <button
                        type="button"
                        className="cf-btn cf-btn--sm cf-btn--ghost cf-btn--danger"
                        onClick={() => void onDelete(r.id, r.label)}
                        title={
                          count > 0
                            ? `Retirez d’abord ${count} membre(s) de ce rôle`
                            : 'Supprimer ce rôle'
                        }
                        disabled={count > 0}
                        aria-disabled={count > 0}
                      >
                        <span className="material-symbols-outlined" aria-hidden>
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

      {/* Modal édition */}
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
            aria-labelledby="role-edit-title"
          >
            <h2 id="role-edit-title" className="cf-modal-title">
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
