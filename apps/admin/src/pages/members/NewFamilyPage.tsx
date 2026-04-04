import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CLUB_CONTACTS,
  CLUB_FAMILIES,
  CLUB_MEMBERS,
  CREATE_CLUB_FAMILY,
} from '../../lib/documents';
import type {
  ClubContactsQueryData,
  FamiliesQueryData,
  MembersQueryData,
} from '../../lib/types';
import { useMembersUi } from './members-ui-context';

type PayerMode = 'member' | 'contact';

export function NewFamilyPage() {
  const navigate = useNavigate();
  const { setDrawerFamilyId } = useMembersUi();
  const [label, setLabel] = useState('');
  const [payerMode, setPayerMode] = useState<PayerMode>('member');
  const [payerMemberId, setPayerMemberId] = useState('');
  const [payerContactId, setPayerContactId] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [formError, setFormError] = useState<string | null>(null);

  const { refetch: refetchFamilies } = useQuery<FamiliesQueryData>(CLUB_FAMILIES);
  const { data: membersData } = useQuery<MembersQueryData>(CLUB_MEMBERS);
  const { data: contactsData } = useQuery<ClubContactsQueryData>(CLUB_CONTACTS);

  const [createFamily, { loading: creating }] = useMutation(
    CREATE_CLUB_FAMILY,
    {
      onCompleted: (res) => {
        const id = (res as { createClubFamily?: { id: string } })
          .createClubFamily?.id;
        setLabel('');
        setPayerMemberId('');
        setPayerContactId('');
        setSelectedIds(new Set());
        setFormError(null);
        void refetchFamilies();
        if (id) setDrawerFamilyId(id);
        navigate('/members/families');
      },
      onError: (e) => setFormError(e.message),
    },
  );

  const members = membersData?.clubMembers ?? [];
  const contacts = contactsData?.clubContacts ?? [];

  function toggleMember(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (payerMode === 'member') {
      if (!payerMemberId) {
        setFormError('Choisissez le payeur du foyer (adhérent).');
        return;
      }
      const ids = new Set(selectedIds);
      ids.add(payerMemberId);
      const memberIds = [...ids];
      if (memberIds.length < 1) {
        setFormError('Au moins un membre requis.');
        return;
      }
      await createFamily({
        variables: {
          input: {
            label: label.trim() || undefined,
            payerMemberId: payerMemberId,
            memberIds,
          },
        },
      });
      return;
    }

    if (!payerContactId) {
      setFormError('Choisissez le payeur (contact du club).');
      return;
    }
    const memberIds = [...selectedIds];
    if (memberIds.length < 1) {
      setFormError('Au moins un adhérent doit composer le foyer.');
      return;
    }
    await createFamily({
      variables: {
        input: {
          label: label.trim() || undefined,
          payerContactId,
          memberIds,
        },
      },
    });
  }

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <div className="members-hero__actions">
          <div>
            <p className="members-loom__eyebrow">Membres · Familles</p>
            <h1 className="members-loom__title">Nouveau foyer</h1>
            <p className="members-loom__lede">
              Un payeur (adhérent ou contact) et des membres — les fiches
              adhérents doivent déjà exister.
            </p>
          </div>
          <Link
            to="/members/families"
            className="btn btn-ghost members-hero__back"
          >
            ← Retour aux foyers
          </Link>
        </div>
      </header>

      <div className="members-loom__grid members-loom__grid--single">
        <section className="members-panel">
          <h2 className="members-panel__h">Création</h2>
          <form className="members-form" onSubmit={(e) => void onSubmit(e)}>
            {formError ? <p className="form-error">{formError}</p> : null}
            <label className="field">
              <span>Libellé (optionnel)</span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Famille Martin"
              />
            </label>

            <fieldset className="field" style={{ border: 'none', padding: 0, margin: 0 }}>
              <span>Type de payeur</span>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.35rem' }}>
                <label className="families-check-row">
                  <input
                    type="radio"
                    name="payerMode"
                    checked={payerMode === 'member'}
                    onChange={() => {
                      setPayerMode('member');
                      setPayerContactId('');
                    }}
                  />
                  <span>Adhérent (fiche membre)</span>
                </label>
                <label className="families-check-row">
                  <input
                    type="radio"
                    name="payerMode"
                    checked={payerMode === 'contact'}
                    onChange={() => {
                      setPayerMode('contact');
                      setPayerMemberId('');
                    }}
                  />
                  <span>Contact (sans fiche adhérent)</span>
                </label>
              </div>
            </fieldset>

            {payerMode === 'member' ? (
              <label className="field">
                <span>Payeur (adhérent)</span>
                <select
                  value={payerMemberId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setPayerMemberId(id);
                    if (id) {
                      setSelectedIds((prev) => new Set(prev).add(id));
                    }
                  }}
                  required
                >
                  <option value="">— Choisir —</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.firstName} {m.lastName}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="field">
                <span>Payeur (contact)</span>
                <select
                  value={payerContactId}
                  onChange={(e) => setPayerContactId(e.target.value)}
                  required
                >
                  <option value="">— Choisir —</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.firstName} {c.lastName}
                      {c.linkedMemberId ? ' (déjà lié à un adhérent)' : ''}
                    </option>
                  ))}
                </select>
                <p className="muted" style={{ margin: '0.35rem 0 0' }}>
                  Réservé aux contacts sans fiche adhérent active sur le même
                  compte ; sinon rattachez l’adhérent comme payeur.
                </p>
              </label>
            )}

            <div className="field">
              <span>Membres du foyer</span>
              <p className="muted" style={{ margin: '0 0 0.5rem' }}>
                {payerMode === 'member'
                  ? 'Cochez les adhérents rattachés (le payeur est inclus automatiquement).'
                  : 'Cochez au moins un adhérent du foyer (le payeur est le contact choisi ci-dessus).'}
              </p>
              <ul className="families-member-checks">
                {members.map((m) => (
                  <li key={m.id}>
                    <label className="families-check-row">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(m.id)}
                        disabled={
                          payerMode === 'member' && m.id === payerMemberId
                        }
                        onChange={() => toggleMember(m.id)}
                      />
                      <span>
                        {m.firstName} {m.lastName}
                        {payerMode === 'member' && m.id === payerMemberId ? (
                          <span className="families-payer-tag">Payeur</span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
            <button
              type="submit"
              className="btn btn-primary members-form__submit"
              disabled={
                creating ||
                members.length === 0 ||
                (payerMode === 'contact' && contacts.length === 0)
              }
            >
              {creating ? 'Création…' : 'Créer le foyer'}
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
