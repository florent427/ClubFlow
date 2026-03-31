import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CLUB_CONTACTS,
  CLUB_FAMILIES,
  CLUB_HOUSEHOLD_GROUPS,
  CLUB_MEMBERS,
  CREATE_HOUSEHOLD_GROUP,
  REMOVE_CLUB_FAMILY_LINK,
  REMOVE_CLUB_MEMBER_FROM_FAMILY,
  SET_CLUB_FAMILY_PAYER,
  SET_FAMILY_HOUSEHOLD_GROUP,
  SET_HOUSEHOLD_GROUP_CARRIER,
  TRANSFER_CLUB_MEMBER_TO_FAMILY,
  UPDATE_CLUB_FAMILY,
} from '../../lib/documents';
import type {
  ClubContactsQueryData,
  FamiliesQueryData,
  MembersQueryData,
} from '../../lib/types';
import { useMembersUi } from './members-ui-context';

function FamilyLabelEditor({
  serverLabel,
  savingLabel,
  onSave,
}: {
  serverLabel: string;
  savingLabel: boolean;
  onSave: (label: string | null) => Promise<unknown>;
}) {
  const [labelDraft, setLabelDraft] = useState(serverLabel);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = labelDraft.trim();
    await onSave(trimmed === '' ? null : trimmed);
  }

  return (
    <form className="family-drawer__section" onSubmit={(e) => void submit(e)}>
      <h3 className="family-drawer__h">Libellé</h3>
      <label className="field">
        <span>Nom du foyer</span>
        <input
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          placeholder="Famille Martin"
        />
      </label>
      <button
        type="submit"
        className="btn btn-primary"
        disabled={savingLabel}
      >
        {savingLabel ? 'Enregistrement…' : 'Enregistrer le libellé'}
      </button>
    </form>
  );
}

export function FamilyDetailDrawer({
  familyId,
  onClose,
}: {
  familyId: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { setDrawerMemberId } = useMembersUi();

  const { data: famData, refetch: refetchFamilies } =
    useQuery<FamiliesQueryData>(CLUB_FAMILIES);
  const { data: hgData, refetch: refetchHg } = useQuery<{
    clubHouseholdGroups: { id: string; label: string | null }[];
  }>(CLUB_HOUSEHOLD_GROUPS);
  const { data: membersData, refetch: refetchMembers } =
    useQuery<MembersQueryData>(CLUB_MEMBERS);
  const { data: contactsData, refetch: refetchContacts } =
    useQuery<ClubContactsQueryData>(CLUB_CONTACTS);

  useEffect(() => {
    void refetchFamilies();
    void refetchMembers();
    void refetchHg();
    void refetchContacts();
  }, [familyId, refetchFamilies, refetchMembers, refetchHg, refetchContacts]);

  const family = useMemo(
    () => famData?.clubFamilies.find((f) => f.id === familyId),
    [famData, familyId],
  );

  const members = membersData?.clubMembers ?? [];

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of members) {
      m.set(x.id, `${x.firstName} ${x.lastName}`);
    }
    return m;
  }, [members]);

  const contactNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of contactsData?.clubContacts ?? []) {
      m.set(c.id, `${c.firstName} ${c.lastName}`);
    }
    return m;
  }, [contactsData?.clubContacts]);

  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [addSearch, setAddSearch] = useState('');

  function refetchAll() {
    void refetchFamilies();
    void refetchMembers();
    void refetchHg();
    void refetchContacts();
  }

  const [createHgMutation] = useMutation(CREATE_HOUSEHOLD_GROUP, {
    onCompleted: () => refetchAll(),
    onError: (e) => setDrawerError(e.message),
  });

  const [setFamilyHouseholdGroup] = useMutation(SET_FAMILY_HOUSEHOLD_GROUP, {
    onCompleted: () => refetchAll(),
    onError: (e) => setDrawerError(e.message),
  });

  const [setHouseholdGroupCarrier] = useMutation(SET_HOUSEHOLD_GROUP_CARRIER, {
    onCompleted: () => refetchAll(),
    onError: (e) => setDrawerError(e.message),
  });

  const [updateFamily, { loading: savingLabel }] = useMutation(
    UPDATE_CLUB_FAMILY,
    {
      onCompleted: () => {
        setDrawerError(null);
        void refetchFamilies();
      },
      onError: (e) => setDrawerError(e.message),
    },
  );

  const [removeMember] = useMutation(REMOVE_CLUB_MEMBER_FROM_FAMILY, {
    onCompleted: () => refetchAll(),
    onError: (e) => setDrawerError(e.message),
  });

  const [removeFamilyLink] = useMutation(REMOVE_CLUB_FAMILY_LINK, {
    onCompleted: () => refetchAll(),
    onError: (e) => setDrawerError(e.message),
  });

  const [setPayer] = useMutation(SET_CLUB_FAMILY_PAYER, {
    onCompleted: () => refetchAll(),
    onError: (e) => setDrawerError(e.message),
  });

  const [transferMember] = useMutation(TRANSFER_CLUB_MEMBER_TO_FAMILY, {
    onCompleted: () => {
      refetchAll();
      setAddSearch('');
    },
    onError: (e) => setDrawerError(e.message),
  });

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  function onRemoveMember(memberId: string) {
    if (!family) return;
    const name = nameById.get(memberId) ?? memberId;
    const link = family.links.find((l) => l.memberId === memberId);
    let msg = `Retirer « ${name} » du foyer ?`;
    if (link?.linkRole === 'PAYER') {
      msg +=
        ' Cette personne est payeur : le foyer pourra être sans payeur si d’autres membres y restent.';
    }
    if (!window.confirm(msg)) return;
    void removeMember({ variables: { memberId } });
  }

  function onRemoveFamilyLink(linkId: string, displayName: string) {
    if (!family) return;
    if (
      !window.confirm(
        `Retirer « ${displayName} » du foyer ? Si c’était le payeur, désignez un nouveau payeur si besoin.`,
      )
    ) {
      return;
    }
    void removeFamilyLink({ variables: { linkId } });
  }

  function onSetPayer(memberId: string) {
    const name = nameById.get(memberId) ?? memberId;
    if (
      !window.confirm(`Désigner « ${name} » comme payeur du foyer ? L’ancien payeur deviendra membre.`)
    ) {
      return;
    }
    void setPayer({ variables: { memberId } });
  }

  const addCandidates = useMemo(() => {
    const q = addSearch.trim().toLowerCase();
    let list = members.filter(
      (m) =>
        m.status === 'ACTIVE' &&
        !family?.links.some((l) => l.memberId === m.id),
    );
    if (q) {
      list = list.filter((m) =>
        `${m.firstName} ${m.lastName}`.toLowerCase().includes(q),
      );
    }
    return list.slice(0, 20);
  }, [members, family, addSearch]);

  async function addMember(m: MembersQueryData['clubMembers'][0]) {
    let msg = `Ajouter « ${m.firstName} ${m.lastName} » comme membre de ce foyer ?`;
    if (m.family && m.family.id !== familyId) {
      msg =
        'Cette personne est dans un autre foyer. La transférer ici ? L’ancien lien sera retiré.';
      if (m.familyLink?.linkRole === 'PAYER') {
        const othersInOld = members.filter(
          (x) => x.family?.id === m.family?.id && x.id !== m.id,
        ).length;
        if (othersInOld > 0) {
          msg +=
            ' L’ancien foyer pourra être sans payeur jusqu’à désignation d’un payeur.';
        }
      }
    }
    if (!window.confirm(msg)) return;
    await transferMember({
      variables: {
        memberId: m.id,
        familyId,
        linkRole: 'MEMBER',
      },
    });
  }

  function openAnnuaireForMember(memberId: string) {
    setDrawerMemberId(memberId);
    onClose();
    navigate('/members');
  }

  return (
    <div
      className="family-drawer-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <aside
        className="family-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="family-drawer-title"
      >
        {!family ? (
          <>
            <p className="muted">Chargement du foyer…</p>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Fermer
            </button>
          </>
        ) : (
          <>
            <header className="family-drawer__head">
              <div>
                <p className="members-loom__eyebrow" id="family-drawer-title">
                  Foyer
                </p>
                <h2 className="family-drawer__title">
                  {family.label ?? 'Sans nom'}
                </h2>
                {family.needsPayer ? (
                  <span className="families-needs-payer-badge">
                    Payeur manquant
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-tight"
                onClick={onClose}
              >
                Fermer
              </button>
            </header>

            {drawerError ? <p className="form-error">{drawerError}</p> : null}

            <p className="muted family-drawer__hint">
              <Link to="/members">Annuaire</Link> — rôles métier et grades sur la
              fiche membre.
            </p>

            <FamilyLabelEditor
              key={`${family.id}:${family.label ?? ''}`}
              serverLabel={family.label ?? ''}
              savingLabel={savingLabel}
              onSave={(label) =>
                updateFamily({
                  variables: {
                    input: {
                      id: family.id,
                      label,
                    },
                  },
                })
              }
            />

            <div className="family-drawer__section">
              <h3 className="family-drawer__h">Espace familial partagé (foyer étendu)</h3>
              <p className="muted">
                Reliez plusieurs foyers « résidences » pour une <strong>facturation
                commune</strong> côté club. Sur le <strong>portail membre</strong>,
                les adultes voient alors un <strong>espace partagé</strong>
                (factures, membres par foyer) ; documents et messagerie
                intra-familiale sont prévus dans une prochaine version.
              </p>
              {family.householdGroupId ? (
                <div className="family-drawer__hg-actions">
                  <p className="muted">
                    Rattaché au groupe{' '}
                    <code>{family.householdGroupId.slice(0, 8)}…</code>
                  </p>
                  <div className="family-drawer__member-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-tight"
                      onClick={() =>
                        void setHouseholdGroupCarrier({
                          variables: {
                            input: {
                              householdGroupId: family.householdGroupId!,
                              carrierFamilyId: family.id,
                            },
                          },
                        })
                      }
                    >
                      Définir comme foyer porteur
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-tight"
                      onClick={() =>
                        void setFamilyHouseholdGroup({
                          variables: {
                            input: {
                              familyId: family.id,
                              householdGroupId: null,
                            },
                          },
                        })
                      }
                    >
                      Retirer du groupe
                    </button>
                  </div>
                </div>
              ) : (
                <div className="family-drawer__hg-actions">
                  <label className="field">
                    <span>Rattacher à un groupe existant</span>
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) return;
                        void setFamilyHouseholdGroup({
                          variables: {
                            input: {
                              familyId: family.id,
                              householdGroupId: v,
                            },
                          },
                        });
                        e.currentTarget.value = '';
                      }}
                    >
                      <option value="">— Choisir un groupe —</option>
                      {(hgData?.clubHouseholdGroups ?? []).map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.label?.trim() || g.id.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <form
                    className="family-drawer__section"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const labelEl = form.elements.namedItem(
                        'newHgLabel',
                      ) as HTMLInputElement;
                      const label = labelEl.value.trim();
                      if (!label) return;
                      void createHgMutation({
                        variables: { input: { label } },
                      }).then((res) => {
                        const newId = (
                          res.data as
                            | { createHouseholdGroup?: { id: string } }
                            | undefined
                        )?.createHouseholdGroup?.id;
                        if (newId) {
                          void setFamilyHouseholdGroup({
                            variables: {
                              input: {
                                familyId: family.id,
                                householdGroupId: newId,
                              },
                            },
                          });
                        }
                        labelEl.value = '';
                      });
                    }}
                  >
                    <label className="field">
                      <span>Créer un groupe et rattacher ce foyer</span>
                      <input name="newHgLabel" placeholder="Libellé du groupe" />
                    </label>
                    <button type="submit" className="btn btn-primary btn-tight">
                      Créer
                    </button>
                  </form>
                </div>
              )}
            </div>

            <div className="family-drawer__section">
              <h3 className="family-drawer__h">Membres</h3>
              <ul className="family-drawer__members">
                {family.links.map((l) => {
                  const isContactPayer =
                    l.contactId != null && l.memberId == null;
                  const displayName = isContactPayer
                    ? (contactNameById.get(l.contactId!) ??
                      `Contact ${l.contactId!.slice(0, 8)}…`)
                    : (nameById.get(l.memberId!) ?? l.memberId!);
                  return (
                    <li key={l.id} className="family-drawer__member-row">
                      <div>
                        <strong>{displayName}</strong>
                        <span className="muted family-drawer__role">
                          {l.linkRole === 'PAYER'
                            ? isContactPayer
                              ? 'Payeur (contact)'
                              : 'Payeur'
                            : 'Membre'}
                        </span>
                      </div>
                      <div className="family-drawer__member-actions">
                        {l.memberId ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-tight"
                            onClick={() => openAnnuaireForMember(l.memberId!)}
                          >
                            Fiche
                          </button>
                        ) : (
                          <Link
                            className="btn btn-ghost btn-tight"
                            to="/contacts"
                          >
                            Contacts
                          </Link>
                        )}
                        {l.linkRole === 'MEMBER' && l.memberId ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-tight"
                            onClick={() => onSetPayer(l.memberId!)}
                          >
                            Payeur
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-ghost btn-tight members-table__danger"
                          onClick={() =>
                            l.memberId
                              ? onRemoveMember(l.memberId)
                              : onRemoveFamilyLink(l.id, displayName)
                          }
                        >
                          Retirer
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="family-drawer__section">
              <h3 className="family-drawer__h">Ajouter un membre</h3>
              <label className="field">
                <span>Recherche (prénom / nom)</span>
                <input
                  type="search"
                  value={addSearch}
                  onChange={(e) => setAddSearch(e.target.value)}
                  placeholder="Tapez pour filtrer les adhérents non rattachés à ce foyer"
                />
              </label>
              {addCandidates.length === 0 ? (
                <p className="muted">Aucun membre éligible avec ce filtre.</p>
              ) : (
                <ul className="family-drawer__add-list">
                  {addCandidates.map((m) => (
                    <li key={m.id}>
                      <div className="family-drawer__add-row">
                        <span>
                          {m.firstName} {m.lastName}
                          {m.family ? (
                            <span className="muted family-drawer__add-sub">
                              {' '}
                              · {m.family.label ?? 'autre foyer'}
                            </span>
                          ) : null}
                        </span>
                        <button
                          type="button"
                          className="btn btn-primary btn-tight"
                          onClick={() => void addMember(m)}
                        >
                          Ajouter
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
