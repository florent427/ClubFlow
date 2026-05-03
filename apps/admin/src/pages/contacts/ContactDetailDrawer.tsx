import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useState } from 'react';
import { QuickMessageModal } from '../../components/QuickMessageModal';
import { useClubCommunicationEnabled } from '../../lib/useClubCommunicationEnabled';
import {
  ATTACH_CLUB_CONTACT_TO_FAMILY_AS_MEMBER,
  CLUB_CONTACT,
  CLUB_FAMILIES,
  DELETE_CLUB_CONTACT,
  PROMOTE_CONTACT_TO_MEMBER,
  REMOVE_CLUB_FAMILY_LINK,
  UPDATE_CLUB_CONTACT,
} from '../../lib/documents';
import type {
  AttachClubContactToFamilyAsMemberMutationData,
  ClubContactQueryData,
  DeleteClubContactMutationData,
  FamiliesQueryData,
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

  const { data: familiesData, refetch: refetchFamilies } =
    useQuery<FamiliesQueryData>(CLUB_FAMILIES, {
      skip: !contactId,
      fetchPolicy: 'cache-and-network',
    });

  const [attachToFamily, { loading: attaching }] =
    useMutation<AttachClubContactToFamilyAsMemberMutationData>(
      ATTACH_CLUB_CONTACT_TO_FAMILY_AS_MEMBER,
    );
  const [removeFamilyLink, { loading: removingLink }] = useMutation(
    REMOVE_CLUB_FAMILY_LINK,
  );

  const [selectedFamilyId, setSelectedFamilyId] = useState<string>('');

  const currentFamilyLink = (() => {
    if (!contactId || !familiesData?.clubFamilies) return null;
    for (const fam of familiesData.clubFamilies) {
      const link = fam.links.find((l) => l.contactId === contactId);
      if (link) {
        return { family: fam, link };
      }
    }
    return null;
  })();

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

  async function onAttachFamily() {
    if (!selectedFamilyId) return;
    setLocalError(null);
    try {
      await attachToFamily({
        variables: { familyId: selectedFamilyId, contactId },
      });
      setSelectedFamilyId('');
      await refetchFamilies();
      onChanged();
    } catch (e) {
      setLocalError(gqlErrorMessage(e));
    }
  }

  async function onDetachFamily(linkId: string) {
    if (
      !window.confirm(
        'Retirer ce contact du foyer ? Son accès en lecture sera supprimé.',
      )
    ) {
      return;
    }
    setLocalError(null);
    try {
      await removeFamilyLink({ variables: { linkId } });
      await refetchFamilies();
      onChanged();
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

            <div className="family-drawer__section" style={{ marginTop: '1.5rem' }}>
              <h3 style={{ marginTop: 0 }}>Foyer</h3>
              {currentFamilyLink ? (
                <div>
                  <p className="muted" style={{ marginTop: 0 }}>
                    Rattaché au foyer{' '}
                    <strong>
                      {currentFamilyLink.family.label ?? 'Sans nom'}
                    </strong>{' '}
                    en tant que{' '}
                    <strong>
                      {currentFamilyLink.link.linkRole === 'PAYER'
                        ? 'payeur'
                        : 'membre observateur'}
                    </strong>
                    .
                  </p>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={removingLink}
                    onClick={() =>
                      void onDetachFamily(currentFamilyLink.link.id)
                    }
                  >
                    {removingLink ? 'Retrait…' : 'Retirer du foyer'}
                  </button>
                </div>
              ) : (
                <div>
                  <p className="muted" style={{ marginTop: 0 }}>
                    Ce contact n'est rattaché à aucun foyer. Vous pouvez le
                    rattacher à un foyer existant en tant que membre
                    observateur (accès en lecture).
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      gap: '0.5rem',
                      alignItems: 'flex-end',
                      flexWrap: 'wrap',
                    }}
                  >
                    <label className="field" style={{ flex: 1, minWidth: 220 }}>
                      <span>Foyer</span>
                      <select
                        value={selectedFamilyId}
                        onChange={(e) => setSelectedFamilyId(e.target.value)}
                      >
                        <option value="">— Choisir un foyer —</option>
                        {familiesData?.clubFamilies.map((fam) => (
                          <option key={fam.id} value={fam.id}>
                            {fam.label ?? `Foyer ${fam.id.slice(0, 8)}`}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={!selectedFamilyId || attaching}
                      onClick={() => void onAttachFamily()}
                    >
                      {attaching ? 'Rattachement…' : 'Rattacher au foyer'}
                    </button>
                  </div>
                </div>
              )}
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
