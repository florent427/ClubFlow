import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import {
  CLUB_TEAM_MEMBERS,
  INVITE_CLUB_TEAM_MEMBER,
  REMOVE_CLUB_TEAM_MEMBER,
  SET_CLUB_TEAM_MEMBER_ROLE,
} from '../../lib/documents';
import type {
  ClubTeamMemberRow,
  ClubTeamMembersQueryData,
  MembershipRoleStr,
} from '../../lib/types';
import { useToast } from '../../components/ToastProvider';

const ROLES: { value: MembershipRoleStr; label: string; aide: string }[] = [
  {
    value: 'CLUB_ADMIN',
    label: 'Administrateur du club',
    aide: 'Accès complet, y compris cette page.',
  },
  { value: 'BOARD', label: 'Bureau', aide: 'Accès back-office étendu.' },
  {
    value: 'TREASURER',
    label: 'Trésorerie',
    aide: 'Accès back-office, orienté finances.',
  },
  { value: 'SECRETARY', label: 'Secrétariat', aide: 'Rôle métier.' },
  { value: 'COACH', label: 'Entraîneur', aide: 'Rôle métier.' },
  {
    value: 'COMM_MANAGER',
    label: 'Responsable communication',
    aide: 'Éditorial du site vitrine.',
  },
  {
    value: 'PROJECT_MANAGER',
    label: 'Chef de projet',
    aide: 'Administration des projets du club.',
  },
  { value: 'STAFF', label: 'Staff', aide: 'Rôle par défaut.' },
];

function roleLabel(role: MembershipRoleStr): string {
  return ROLES.find((r) => r.value === role)?.label ?? role;
}

/**
 * Pourquoi une action est impossible — ou `null` si elle est permise.
 *
 * Les deux garde-fous mènent au même état irrécupérable : un club sans plus
 * aucun administrateur. On les rend VISIBLES ici (bouton désactivé + raison
 * écrite) plutôt que de laisser l'appel échouer : un bouton qui échoue
 * n'apprend rien à qui le clique. Le refus RÉEL reste prononcé par l'API —
 * cet écran peut être périmé, il ne peut pas être contourné.
 */
function empechement(
  row: ClubTeamMemberRow,
  action: 'retirer' | 'rétrograder',
): string | null {
  if (row.isSelf) {
    return `Vous ne pouvez pas ${action} votre propre accès. Demandez à un autre administrateur du club de le faire.`;
  }
  if (row.isLastAdmin) {
    return `Seul administrateur du club : le ${action} laisserait le club sans aucun accès d’administration. Nommez d’abord un second administrateur.`;
  }
  return null;
}

export function ClubTeamPage() {
  const { showToast } = useToast();
  const { data, loading, refetch } = useQuery<ClubTeamMembersQueryData>(
    CLUB_TEAM_MEMBERS,
    { fetchPolicy: 'cache-and-network' },
  );

  const [invite, { loading: inviting }] = useMutation(INVITE_CLUB_TEAM_MEMBER);
  const [setRole, { loading: settingRole }] = useMutation(
    SET_CLUB_TEAM_MEMBER_ROLE,
  );
  const [remove, { loading: removing }] = useMutation(REMOVE_CLUB_TEAM_MEMBER);

  const [email, setEmail] = useState('');
  const [role, setRoleValue] = useState<MembershipRoleStr>('BOARD');

  const rows = data?.clubTeamMembers ?? [];
  const nbAdmins = rows.filter((r) => r.role === 'CLUB_ADMIN').length;
  const occupe = inviting || settingRole || removing;

  function erreur(err: unknown) {
    showToast(err instanceof Error ? err.message : 'Erreur inconnue', 'error');
  }

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    const saisi = email.trim();
    if (!saisi) return;
    try {
      await invite({ variables: { input: { email: saisi, role } } });
      showToast(`Accès accordé à ${saisi}.`, 'success');
      setEmail('');
      await refetch();
    } catch (err: unknown) {
      erreur(err);
    }
  }

  async function onChangeRole(row: ClubTeamMemberRow, cible: MembershipRoleStr) {
    if (cible === row.role) return;
    const bloc =
      cible === 'CLUB_ADMIN' ? null : empechement(row, 'rétrograder');
    if (bloc) {
      showToast(bloc, 'error');
      return;
    }
    try {
      await setRole({
        variables: { input: { membershipId: row.membershipId, role: cible } },
      });
      showToast(`${row.email} est désormais ${roleLabel(cible)}.`, 'success');
      await refetch();
    } catch (err: unknown) {
      erreur(err);
    }
  }

  async function onRemove(row: ClubTeamMemberRow) {
    if (
      !window.confirm(
        `Retirer l’accès à l’espace d’administration de ${row.email} ? ` +
          'Son compte et sa fiche adhérent ne sont pas supprimés.',
      )
    ) {
      return;
    }
    try {
      await remove({ variables: { membershipId: row.membershipId } });
      showToast(`Accès retiré à ${row.email}.`, 'success');
      await refetch();
    } catch (err: unknown) {
      erreur(err);
    }
  }

  return (
    <div className="members-loom">
      <header className="members-loom__hero members-loom__hero--nested">
        <p className="members-loom__eyebrow">Administration</p>
        <h1 className="members-loom__title">Équipe</h1>
        <p className="members-loom__lede">
          Qui peut entrer dans l’espace d’administration de ce club. Deux
          règles ne peuvent jamais être contournées :{' '}
          <strong>le dernier administrateur ne peut être ni retiré ni
          rétrogradé</strong>, et <strong>personne n’agit sur son propre
          accès</strong> — sans quoi le club se retrouverait sans personne pour
          y entrer.
        </p>
      </header>

      <div className="members-loom__grid">
        <section className="members-panel members-panel--table">
          <div className="cf-toolbar">
            <h2 className="members-panel__h">Accès actuels</h2>
            <span className="muted">
              {nbAdmins} administrateur{nbAdmins > 1 ? 's' : ''}
            </span>
          </div>

          {nbAdmins <= 1 ? (
            <p className="muted" role="status">
              Ce club n’a qu’<strong>un seul administrateur</strong>. S’il perd
              l’accès à son compte, plus personne ne pourra administrer le club.
              Nommez-en un second dès maintenant.
            </p>
          ) : null}

          {loading && rows.length === 0 ? (
            <p className="muted">Chargement…</p>
          ) : rows.length === 0 ? (
            <p className="muted">Aucun accès enregistré.</p>
          ) : (
            <div className="members-table-wrap">
              <table className="members-table">
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>E-mail</th>
                    <th>Rôle</th>
                    <th>Depuis</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const blocRetrait = empechement(row, 'retirer');
                    const blocRole = empechement(row, 'rétrograder');
                    return (
                      <tr key={row.membershipId}>
                        <td>
                          <strong>{row.displayName}</strong>
                          {row.isSelf ? (
                            <span className="cf-pill" style={{ marginLeft: 8 }}>
                              vous
                            </span>
                          ) : null}
                          {row.isLastAdmin ? (
                            <span
                              className="cf-pill cf-pill--gold"
                              style={{ marginLeft: 8 }}
                              title="Dernier administrateur du club"
                            >
                              dernier admin
                            </span>
                          ) : null}
                        </td>
                        <td>{row.email}</td>
                        <td>
                          <select
                            className="cf-field__input"
                            value={row.role}
                            disabled={occupe || blocRole !== null}
                            title={
                              blocRole ??
                              'Changer le rôle de cet accès'
                            }
                            onChange={(e) =>
                              void onChangeRole(
                                row,
                                e.target.value as MembershipRoleStr,
                              )
                            }
                          >
                            {ROLES.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                          {blocRole ? (
                            <div
                              className="muted"
                              style={{ fontSize: '0.8rem', marginTop: 4 }}
                            >
                              {blocRole}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          {new Date(row.createdAt).toLocaleDateString('fr-FR')}
                        </td>
                        <td>
                          <div className="planning-slot-actions">
                            <button
                              type="button"
                              className="btn btn-ghost btn-tight"
                              disabled={occupe || blocRetrait !== null}
                              title={
                                blocRetrait ?? 'Retirer l’accès back-office'
                              }
                              onClick={() => void onRemove(row)}
                            >
                              Retirer
                            </button>
                          </div>
                          {blocRetrait ? (
                            <div
                              className="muted"
                              style={{ fontSize: '0.8rem', marginTop: 4 }}
                            >
                              {blocRetrait}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="members-panel members-panel--aside">
          <h2 className="members-panel__h">Donner un accès</h2>
          <p className="muted">
            L’adresse doit être celle d’un <strong>compte ClubFlow existant</strong>.
            Si aucun compte ne correspond, ClubFlow vous le dira : la personne
            doit d’abord créer son compte (ou recevoir une invitation depuis sa
            fiche adhérent).
          </p>
          <form onSubmit={(e) => void onInvite(e)}>
            <label className="cf-field">
              <span className="cf-field__label">E-mail du compte</span>
              <input
                className="cf-field__input"
                type="email"
                required
                autoComplete="off"
                placeholder="prenom.nom@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>

            <label className="cf-field">
              <span className="cf-field__label">Rôle</span>
              <select
                className="cf-field__input"
                value={role}
                onChange={(e) =>
                  setRoleValue(e.target.value as MembershipRoleStr)
                }
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted" style={{ fontSize: '0.8rem' }}>
              {ROLES.find((r) => r.value === role)?.aide}
            </p>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={occupe || email.trim() === ''}
            >
              {inviting ? 'Envoi…' : 'Donner l’accès'}
            </button>
          </form>

          <h2 className="members-panel__h" style={{ marginTop: '1.5rem' }}>
            Pourquoi ces blocages ?
          </h2>
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            Un club sans administrateur ne peut plus être récupéré depuis
            l’application : il faut intervenir directement en base. Les deux
            règles ci-dessus existent pour rendre cet état impossible — elles
            sont aussi appliquées côté serveur, dans la requête d’écriture
            elle-même.
          </p>
        </aside>
      </div>
    </div>
  );
}
