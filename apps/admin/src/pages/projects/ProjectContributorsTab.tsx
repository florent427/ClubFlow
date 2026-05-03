import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import { CLUB_MEMBERS, CLUB_CONTACTS } from '../../lib/documents';
import {
  INVITE_PROJECT_CONTRIBUTOR,
  PROJECT_CONTRIBUTORS,
  REVOKE_PROJECT_CONTRIBUTOR,
  type ClubProjectGraph,
  type ProjectContributorGraph,
} from '../../lib/projects-documents';
import type {
  ClubContactsQueryData,
  MembersQueryData,
} from '../../lib/types';
import { useToast } from '../../components/ToastProvider';

/**
 * Gestion des contributeurs d'un projet (Member OU Contact polymorphes).
 * Interface d'invitation simple : tabs Membres/Contacts + picker avec
 * recherche ; à la sélection, appel mutation avec exactement un des deux
 * IDs rempli.
 */
export function ProjectContributorsTab({
  project,
}: {
  project: ClubProjectGraph;
}) {
  const { showToast } = useToast();

  const { data: contribData, loading } = useQuery<{
    projectContributors: ProjectContributorGraph[];
  }>(PROJECT_CONTRIBUTORS, {
    variables: { projectId: project.id, includeRevoked: true },
    fetchPolicy: 'cache-and-network',
  });

  const { data: membersData } = useQuery<MembersQueryData>(CLUB_MEMBERS, {
    fetchPolicy: 'cache-and-network',
  });
  const { data: contactsData } = useQuery<ClubContactsQueryData>(
    CLUB_CONTACTS,
    { fetchPolicy: 'cache-and-network' },
  );

  const [invite] = useMutation(INVITE_PROJECT_CONTRIBUTOR, {
    refetchQueries: [
      {
        query: PROJECT_CONTRIBUTORS,
        variables: { projectId: project.id, includeRevoked: true },
      },
    ],
  });
  const [revoke] = useMutation(REVOKE_PROJECT_CONTRIBUTOR, {
    refetchQueries: [
      {
        query: PROJECT_CONTRIBUTORS,
        variables: { projectId: project.id, includeRevoked: true },
      },
    ],
  });

  const [showInvite, setShowInvite] = useState(false);
  const [inviteTab, setInviteTab] = useState<'member' | 'contact'>('member');
  const [query, setQuery] = useState('');

  const contributors = contribData?.projectContributors ?? [];
  const activeIds = new Set(
    contributors
      .filter((c) => !c.revokedAt)
      .map((c) => c.memberId ?? c.contactId ?? ''),
  );

  const members = (membersData?.clubMembers ?? []).filter(
    (m) => m.status === 'ACTIVE' && !activeIds.has(m.id),
  );
  const contacts = (contactsData?.clubContacts ?? []).filter(
    (c) => !activeIds.has(c.id),
  );

  const filteredMembers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      `${m.firstName ?? ''} ${m.lastName ?? ''}`.toLowerCase().includes(q),
    );
  }, [members, query]);

  const filteredContacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      `${c.firstName ?? ''} ${c.lastName ?? ''}`.toLowerCase().includes(q),
    );
  }, [contacts, query]);

  async function handleInvite(
    target: { memberId?: string; contactId?: string },
  ) {
    try {
      await invite({
        variables: {
          input: {
            projectId: project.id,
            memberId: target.memberId ?? null,
            contactId: target.contactId ?? null,
          },
        },
      });
      setShowInvite(false);
      setQuery('');
      showToast('Contributeur invité.', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Échec de l’invitation',
        'error',
      );
    }
  }

  async function handleRevoke(contributorId: string) {
    const reason = window.prompt(
      'Raison de la révocation ? (facultatif, visible dans les logs)',
    );
    try {
      await revoke({
        variables: { id: contributorId, reason: reason?.trim() || null },
      });
      showToast('Contributeur révoqué.', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Échec de la révocation',
        'error',
      );
    }
  }

  const active = contributors.filter((c) => !c.revokedAt);
  const revoked = contributors.filter((c) => c.revokedAt);

  return (
    <div className="cf-project-contributors">
      <div className="cf-project-contributors__toolbar">
        <h3>
          {active.length} contributeur{active.length > 1 ? 's' : ''} actif
          {active.length > 1 ? 's' : ''}
        </h3>
        <button
          type="button"
          className="cf-btn cf-btn--primary"
          onClick={() => setShowInvite((v) => !v)}
        >
          <span className="material-symbols-outlined" aria-hidden>
            person_add
          </span>
          Inviter
        </button>
      </div>

      {showInvite && (
        <div className="cf-card cf-project-contributors__invite">
          <div className="cf-tabs">
            {(['member', 'contact'] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={`cf-tab${inviteTab === t ? ' cf-tab--active' : ''}`}
                onClick={() => setInviteTab(t)}
              >
                {t === 'member' ? 'Membre' : 'Contact'}
              </button>
            ))}
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Rechercher un ${
              inviteTab === 'member' ? 'membre' : 'contact'
            }…`}
            className="cf-input"
          />
          <ul className="cf-project-contributors__picker">
            {(inviteTab === 'member' ? filteredMembers : filteredContacts)
              .slice(0, 20)
              .map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() =>
                      handleInvite(
                        inviteTab === 'member'
                          ? { memberId: p.id }
                          : { contactId: p.id },
                      )
                    }
                  >
                    <span className="material-symbols-outlined" aria-hidden>
                      person
                    </span>
                    {p.firstName} {p.lastName}
                  </button>
                </li>
              ))}
            {(inviteTab === 'member' ? filteredMembers : filteredContacts)
              .length === 0 && (
              <li className="cf-text-muted">
                Aucun{' '}
                {inviteTab === 'member' ? 'membre actif' : 'contact'} à ajouter.
              </li>
            )}
          </ul>
        </div>
      )}

      {loading && contributors.length === 0 ? (
        <p>Chargement…</p>
      ) : (
        <ul className="cf-project-contributors__list">
          {active.map((c) => (
            <li key={c.id}>
              <div className="cf-project-contributors__item">
                {c.photoUrl ? (
                  <img src={c.photoUrl} alt="" loading="lazy" />
                ) : (
                  <span
                    className="material-symbols-outlined cf-project-contributors__avatar"
                    aria-hidden
                  >
                    person
                  </span>
                )}
                <div>
                  <strong>{c.displayName ?? 'Contributeur'}</strong>
                  <small>
                    {c.memberId ? 'Membre' : 'Contact'} · ajouté le{' '}
                    {new Date(c.addedAt).toLocaleDateString('fr-FR')}
                  </small>
                </div>
                <button
                  type="button"
                  className="cf-btn cf-btn--sm cf-btn--ghost"
                  onClick={() => handleRevoke(c.id)}
                >
                  Révoquer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {revoked.length > 0 && (
        <details className="cf-project-contributors__revoked">
          <summary>Contributeurs révoqués ({revoked.length})</summary>
          <ul>
            {revoked.map((c) => (
              <li key={c.id}>
                <strong>{c.displayName ?? '—'}</strong>
                <small>
                  révoqué le{' '}
                  {c.revokedAt
                    ? new Date(c.revokedAt).toLocaleDateString('fr-FR')
                    : ''}
                  {c.revokedReason ? ` — ${c.revokedReason}` : ''}
                </small>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
