import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useState } from 'react';
import { QuickMessageModal } from '../../components/QuickMessageModal';
import { useClubCommunicationEnabled } from '../../lib/useClubCommunicationEnabled';
import {
  CLUB_CONTACT,
  DELETE_CLUB_CONTACT,
  PROMOTE_CONTACT_TO_MEMBER,
  UPDATE_CLUB_CONTACT,
} from '../../lib/documents';
import type {
  ClubContactQueryData,
  DeleteClubContactMutationData,
  PromoteContactToMemberMutationData,
  UpdateClubContactMutationData,
} from '../../lib/types';

function gqlErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'graphQLErrors' in err) {
    const ge = (err as { graphQLErrors?: { message?: string }[] })
      .graphQLErrors;
    const m = ge?.[0]?.message;
    if (m) return m;
  }
  if (err instanceof Error) return err.message;
  return 'Une erreur est survenue.';
}

export function ContactDetailDrawer({
  contactId,
  onClose,
  onChanged,
}: {
  contactId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const commEnabled = useClubCommunicationEnabled();
  const [quickMsgOpen, setQuickMsgOpen] = useState(false);

  useEffect(() => {
    if (!commEnabled) setQuickMsgOpen(false);
  }, [commEnabled]);

  const { data, loading, refetch } = useQuery<ClubContactQueryData>(
    CLUB_CONTACT,
    {
      skip: !contactId,
      variables: { id: contactId ?? '' },
      fetchPolicy: 'network-only',
    },
  );

  const c = data?.clubContact;

  useEffect(() => {
    if (!c) return;
    setFirstName(c.firstName);
    setLastName(c.lastName);
    setLocalError(null);
  }, [c?.id, c?.firstName, c?.lastName]);

  const [updateContact, { loading: saving }] =
    useMutation<UpdateClubContactMutationData>(UPDATE_CLUB_CONTACT);
  const [deleteContact, { loading: deleting }] =
    useMutation<DeleteClubContactMutationData>(DELETE_CLUB_CONTACT);
  const [promote, { loading: promoting }] =
    useMutation<PromoteContactToMemberMutationData>(PROMOTE_CONTACT_TO_MEMBER);

  if (!contactId) {
    return null;
  }

  async function onSave() {
    setLocalError(null);
    try {
      await updateContact({
        variables: {
          input: {
            id: contactId,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
          },
        },
      });
      await refetch();
      onChanged();
    } catch (e) {
      setLocalError(gqlErrorMessage(e));
    }
  }

  async function onDelete() {
    if (
      !window.confirm(
        'Supprimer ce contact ? Le compte ne pourra plus accéder au portail en tant que contact pour ce club.',
      )
    ) {
      return;
    }
    setLocalError(null);
    try {
      await deleteContact({ variables: { id: contactId } });
      onChanged();
      onClose();
    } catch (e) {
      setLocalError(gqlErrorMessage(e));
    }
  }

  async function onPromote() {
    if (
      !window.confirm(
        'Promouvoir en membre avec la fiche minimale ? La civilité pourra être corrigée dans l’annuaire.',
      )
    ) {
      return;
    }
    setLocalError(null);
    try {
      const res = await promote({ variables: { id: contactId } });
      const mid = res.data?.promoteContactToMember.memberId;
      onChanged();
      await refetch();
      if (mid) {
        window.alert(
          `Fiche membre créée. Identifiant : ${mid}. Ouvrez l’annuaire pour compléter le dossier.`,
        );
      }
    } catch (e) {
      setLocalError(gqlErrorMessage(e));
    }
  }

  return (
    <>
      <div
        className="family-drawer-backdrop"
        role="presentation"
        onClick={onClose}
      >
        <aside
          className="family-drawer family-drawer--wide"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="contact-drawer-title"
        >
          <header className="family-drawer__head">
            <div>
              <h2 className="family-drawer__title" id="contact-drawer-title">
                Contact portail
              </h2>
              {c ? (
                <p className="muted family-drawer__hint">
                  E-mail (non modifiable ici) : <strong>{c.email}</strong>
                  {c.emailVerified ? (
                    <> — vérifié</>
                  ) : (
                    <> — <span className="form-error">non vérifié</span></>
                  )}
                </p>
              ) : null}
            </div>
            <div className="family-drawer__head-actions">
              {commEnabled && c ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-tight"
                  title="Envoyer un message"
                  onClick={() => setQuickMsgOpen(true)}
                  aria-label="Envoyer un message"
                >
                  <span className="material-symbols-outlined" aria-hidden>
                    mail
                  </span>
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-ghost btn-tight"
                onClick={onClose}
              >
                Fermer
              </button>
            </div>
          </header>

        <p className="muted family-drawer__section" style={{ marginTop: 0 }}>
          Modifier le prénom ou le nom met à jour l’affichage du compte (
          <strong>nom affiché global</strong>) pour toutes les activités liées à
          ce compte utilisateur.
        </p>

        {loading && !c ? (
          <p className="muted">Chargement…</p>
        ) : c ? (
          <div className="family-drawer__section members-form">
            {localError ? (
              <p className="form-error" role="alert">
                {localError}
              </p>
            ) : null}
            {c.linkedMemberId ? (
              <p className="muted">
                Ce compte est aussi <strong>membre</strong> du club. La
                suppression du contact est impossible tant que la fiche membre
                existe.
              </p>
            ) : null}
            <label className="field">
              <span>Prénom</span>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="field">
              <span>Nom</span>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="off"
              />
            </label>
            <div className="members-form__actions" style={{ marginTop: '1rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving}
                onClick={() => void onSave()}
              >
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={promoting || !c.emailVerified || !!c.linkedMemberId}
                title={
                  !c.emailVerified
                    ? 'E-mail à vérifier avant promotion'
                    : c.linkedMemberId
                      ? 'Déjà membre'
                      : undefined
                }
                onClick={() => void onPromote()}
              >
                {promoting ? 'Promotion…' : 'Promouvoir en membre'}
              </button>
              <button
                type="button"
                className="btn btn-ghost members-table__danger"
                disabled={deleting || !c.canDeleteContact}
                title={
                  c.canDeleteContact
                    ? undefined
                    : 'Retirez d’abord la fiche membre depuis l’annuaire'
                }
                onClick={() => void onDelete()}
              >
                {deleting ? 'Suppression…' : 'Supprimer le contact'}
              </button>
            </div>
          </div>
        ) : (
          <p className="form-error">Contact introuvable.</p>
        )}
        </aside>
      </div>
      {c ? (
        <QuickMessageModal
          open={quickMsgOpen}
          onClose={() => setQuickMsgOpen(false)}
          recipientType="CONTACT"
          recipientId={c.id}
          recipientLabel={`${c.firstName} ${c.lastName}`}
        />
      ) : null}
    </>
  );
}
