import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import {
  SYSTEM_ADMINS,
  SYSTEM_DELETE_USER,
  SYSTEM_DEMOTE_ADMIN,
  SYSTEM_PROMOTE_TO_ADMIN,
  VIEWER_SYSTEM_ROLE,
} from '../../lib/documents';
import type {
  SystemAdminsQueryData,
  SystemRoleStr,
  ViewerSystemRoleQueryData,
} from '../../lib/types';
import { useToast } from '../../components/ToastProvider';

function roleLabel(role: SystemRoleStr | null): string {
  if (role === 'SUPER_ADMIN') return 'Super administrateur';
  if (role === 'ADMIN') return 'Administrateur';
  return '—';
}

function rolePillClass(role: SystemRoleStr | null): string {
  if (role === 'SUPER_ADMIN') return 'cf-pill cf-pill--gold';
  if (role === 'ADMIN') return 'cf-pill cf-pill--blue';
  return 'cf-pill';
}

export function SystemAdminsPage() {
  const { showToast } = useToast();
  const [promoteEmail, setPromoteEmail] = useState('');

  const { data: viewerRoleData } = useQuery<ViewerSystemRoleQueryData>(
    VIEWER_SYSTEM_ROLE,
    { fetchPolicy: 'cache-and-network' },
  );
  const { data: adminsData, refetch } = useQuery<SystemAdminsQueryData>(
    SYSTEM_ADMINS,
    { fetchPolicy: 'cache-and-network' },
  );

  const [promote, { loading: promoting }] = useMutation(
    SYSTEM_PROMOTE_TO_ADMIN,
  );
  const [demote, { loading: demoting }] = useMutation(SYSTEM_DEMOTE_ADMIN);
  const [deleteUser, { loading: deleting }] = useMutation(SYSTEM_DELETE_USER);

  const viewerRole = viewerRoleData?.viewerSystemRole ?? null;
  const isSuperAdmin = viewerRole === 'SUPER_ADMIN';
  const isAnyAdmin = viewerRole === 'ADMIN' || isSuperAdmin;

  if (!isAnyAdmin) {
    return (
      <div className="members-loom">
        <header className="members-loom__hero">
          <p className="members-loom__eyebrow">Accès restreint</p>
          <h1 className="members-loom__title">Administrateurs système</h1>
          <p className="members-loom__lede">
            Cette page est réservée aux administrateurs système.
          </p>
        </header>
      </div>
    );
  }

  const admins = adminsData?.systemAdmins ?? [];

  async function onPromote(e: React.FormEvent) {
    e.preventDefault();
    const uuid = promoteEmail.trim();
    if (!uuid) return;
    try {
      await promote({ variables: { userId: uuid } });
      showToast('Utilisateur promu administrateur.', 'success');
      setPromoteEmail('');
      await refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      showToast(msg, 'error');
    }
  }

  async function onDemote(userId: string, email: string) {
    if (
      !window.confirm(
        `Retirer le rôle administrateur à ${email} ? L'utilisateur restera connecté mais perdra l'accès au back-office système.`,
      )
    ) {
      return;
    }
    try {
      await demote({ variables: { userId } });
      showToast('Rôle administrateur retiré.', 'success');
      await refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      showToast(msg, 'error');
    }
  }

  async function onDelete(userId: string, email: string, role: SystemRoleStr | null) {
    const warning =
      role === 'SUPER_ADMIN'
        ? 'Le super administrateur ne peut pas être supprimé.'
        : role === 'ADMIN'
          ? `Supprimer définitivement l'administrateur ${email} ? Cette action est irréversible.`
          : `Supprimer définitivement ${email} ? Cette action est irréversible.`;
    if (role === 'SUPER_ADMIN') {
      window.alert(warning);
      return;
    }
    if (!window.confirm(warning)) return;
    try {
      await deleteUser({ variables: { userId } });
      showToast('Utilisateur supprimé.', 'success');
      await refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      showToast(msg, 'error');
    }
  }

  return (
    <div className="members-loom">
      <header className="members-loom__hero">
        <p className="members-loom__eyebrow">Système</p>
        <h1 className="members-loom__title">Administrateurs système</h1>
        <p className="members-loom__lede">
          Les administrateurs système peuvent gérer les clubs et les
          utilisateurs au-delà d'un seul club. Le{' '}
          <strong>super administrateur</strong> est le seul à pouvoir
          retirer ou supprimer un autre administrateur. Vous êtes connecté
          en tant que <strong>{roleLabel(viewerRole)}</strong>.
        </p>
      </header>

      <div className="members-loom__grid">
        <section className="members-panel members-panel--table">
          <div className="cf-toolbar">
            <h2 className="members-panel__h">Administrateurs actuels</h2>
          </div>
          {admins.length === 0 ? (
            <p className="muted">Aucun administrateur.</p>
          ) : (
            <div className="members-table-wrap">
              <table className="members-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Nom</th>
                    <th>Rôle</th>
                    <th>Créé le</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {admins.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <strong>{u.email}</strong>
                      </td>
                      <td>{u.displayName}</td>
                      <td>
                        <span className={rolePillClass(u.systemRole)}>
                          {roleLabel(u.systemRole)}
                        </span>
                      </td>
                      <td>
                        {new Date(u.createdAt).toLocaleDateString('fr-FR')}
                      </td>
                      <td>
                        <div className="planning-slot-actions">
                          {u.systemRole === 'ADMIN' && isSuperAdmin ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-tight"
                              onClick={() => void onDemote(u.id, u.email)}
                              disabled={demoting}
                            >
                              Retirer le rôle
                            </button>
                          ) : null}
                          {u.systemRole === 'ADMIN' && !isSuperAdmin ? (
                            <span
                              className="muted"
                              title="Seul le super administrateur peut retirer un autre admin"
                            >
                              (verrouillé)
                            </span>
                          ) : null}
                          {u.systemRole !== 'SUPER_ADMIN' &&
                          isSuperAdmin ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-tight"
                              onClick={() =>
                                void onDelete(u.id, u.email, u.systemRole)
                              }
                              disabled={deleting}
                            >
                              Supprimer
                            </button>
                          ) : null}
                          {u.systemRole === 'SUPER_ADMIN' ? (
                            <span className="muted">
                              compte protégé
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="members-panel members-panel--aside">
          <h2 className="members-panel__h">Promouvoir un utilisateur</h2>
          <p className="muted">
            Saisissez l'identifiant (UUID) de l'utilisateur à promouvoir
            au rôle <strong>Administrateur</strong>. L'utilisateur doit
            déjà avoir un compte ClubFlow.
          </p>
          <form className="members-form" onSubmit={(e) => void onPromote(e)}>
            <label className="members-field">
              <span className="members-field__label">Identifiant UUID</span>
              <input
                className="members-field__input"
                value={promoteEmail}
                onChange={(e) => setPromoteEmail(e.target.value)}
                placeholder="ex. 2c60ab45-3432-4fbb-8ee1-…"
                required
              />
            </label>
            <div className="members-actions">
              <button
                type="submit"
                className="members-btn members-btn--primary"
                disabled={promoting || !promoteEmail.trim()}
              >
                {promoting ? 'Promotion…' : 'Promouvoir'}
              </button>
            </div>
          </form>
          <p className="muted" style={{ fontSize: '0.78rem' }}>
            La promotion par email arrivera dans une prochaine itération
            (besoin d'un endpoint de recherche User par email côté
            système).
          </p>
        </aside>
      </div>
    </div>
  );
}
