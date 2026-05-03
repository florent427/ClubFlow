import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import {
  ACCEPT_FAMILY_INVITE,
  VIEWER_PENDING_FAMILY_INVITES,
} from '../lib/viewer-documents';
import type {
  AcceptFamilyInviteData,
  ViewerPendingFamilyInvitesData,
} from '../lib/viewer-types';

const DISMISSED_KEY = 'mp:dismissedFamilyInvites';

function getDismissed(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}
function setDismissed(ids: Set<string>): void {
  try {
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

/**
 * Banner affichée en haut du portail membre dès qu'au moins une
 * invitation familiale pending existe pour l'email de l'user connecté.
 *
 * UX :
 * - Notification non-modale (bandeau en haut) pour ne pas bloquer le flow
 * - Boutons "Accepter" (1 clic) et "Plus tard" (dismiss pour la session)
 * - Affiche le nom de l'inviteur, le rôle, et la date d'expiration
 * - Refetch automatique après accept pour retirer l'invite de la liste
 */
export function PendingFamilyInvitesBanner() {
  const [dismissedIds, setDismissedIdsState] = useState<Set<string>>(
    getDismissed,
  );
  const { data, refetch } = useQuery<ViewerPendingFamilyInvitesData>(
    VIEWER_PENDING_FAMILY_INVITES,
    {
      fetchPolicy: 'cache-and-network',
      // Pas de polling continu — ça refetch après chaque navigation / reload.
    },
  );
  const [accept, { loading: accepting }] =
    useMutation<AcceptFamilyInviteData>(ACCEPT_FAMILY_INVITE);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const all = data?.viewerPendingFamilyInvites ?? [];
  const visible = all.filter((inv) => !dismissedIds.has(inv.id));

  if (visible.length === 0) return null;

  async function onAccept(code: string, id: string): Promise<void> {
    setLocalError(null);
    setAcceptingId(id);
    try {
      const res = await accept({ variables: { input: { code } } });
      if (!res.data?.acceptFamilyInvite?.success) {
        setLocalError(
          res.data?.acceptFamilyInvite?.message ??
            'Échec de l\u2019acceptation.',
        );
        return;
      }
      await refetch();
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Échec de l\u2019acceptation.',
      );
    } finally {
      setAcceptingId(null);
    }
  }

  function onDismiss(id: string): void {
    const next = new Set(dismissedIds);
    next.add(id);
    setDismissed(next);
    setDismissedIdsState(next);
  }

  return (
    <div className="mp-pending-invites" role="region" aria-label="Invitations en attente">
      {visible.map((inv) => {
        const roleLabel = inv.role === 'COPAYER' ? 'co-payeur' : 'observateur';
        const expiresFr = new Date(inv.expiresAt).toLocaleDateString('fr-FR', {
          day: 'numeric',
          month: 'long',
        });
        const isAccepting = accepting && acceptingId === inv.id;
        return (
          <div key={inv.id} className="mp-pending-invite">
            <div className="mp-pending-invite__icon" aria-hidden>
              <span className="material-symbols-outlined">group_add</span>
            </div>
            <div className="mp-pending-invite__body">
              <div className="mp-pending-invite__title">
                <strong>{inv.inviterName}</strong> vous invite à rejoindre son
                espace familial
                {inv.familyLabel ? (
                  <>
                    {' '}
                    (<em>{inv.familyLabel}</em>)
                  </>
                ) : null}{' '}
                en tant que <strong>{roleLabel}</strong>.
              </div>
              <div className="mp-pending-invite__hint">
                Invitation valable jusqu'au {expiresFr}.
              </div>
              {localError ? (
                <p className="mp-form-error" role="alert">
                  {localError}
                </p>
              ) : null}
            </div>
            <div className="mp-pending-invite__actions">
              <button
                type="button"
                className="mp-btn mp-btn-primary mp-btn-sm"
                disabled={isAccepting}
                onClick={() => void onAccept(inv.code, inv.id)}
              >
                {isAccepting ? 'Acceptation…' : 'Accepter'}
              </button>
              <button
                type="button"
                className="mp-btn mp-btn-outline mp-btn-sm"
                disabled={isAccepting}
                onClick={() => onDismiss(inv.id)}
                title="Masquer jusqu'à la prochaine connexion"
              >
                Plus tard
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
