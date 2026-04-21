import { useMutation } from '@apollo/client/react';
import { useState } from 'react';
import {
  VIEWER_ACTIVE_CART,
  VIEWER_REGISTER_CHILD_FOR_CART,
} from '../../lib/cart-documents';
import { useToast } from '../ToastProvider';

type Civility = 'MR' | 'MME';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface RegisterChildResponse {
  viewerRegisterChildMember: {
    memberId: string;
    firstName: string;
    lastName: string;
  };
}

export function AddChildToCartDrawer({ open, onClose }: Props) {
  const { showToast } = useToast();
  const [firstName, setFirstName] = useState<string>('');
  const [lastName, setLastName] = useState<string>('');
  const [civility, setCivility] = useState<Civility>('MR');
  const [birthDate, setBirthDate] = useState<string>('');
  const [localError, setLocalError] = useState<string | null>(null);

  const [registerChild, { loading }] = useMutation<RegisterChildResponse>(
    VIEWER_REGISTER_CHILD_FOR_CART,
    { refetchQueries: [{ query: VIEWER_ACTIVE_CART }] },
  );

  function reset(): void {
    setFirstName('');
    setLastName('');
    setCivility('MR');
    setBirthDate('');
    setLocalError(null);
  }

  function handleClose(): void {
    if (loading) return;
    reset();
    onClose();
  }

  async function handleSubmit(): Promise<void> {
    setLocalError(null);
    if (!firstName.trim() || !lastName.trim() || !birthDate) {
      setLocalError('Prénom, nom et date de naissance sont obligatoires.');
      return;
    }
    try {
      const { data } = await registerChild({
        variables: {
          input: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            civility,
            birthDate,
            membershipProductId: null,
            billingRhythm: null,
          },
        },
      });
      const res = data?.viewerRegisterChildMember;
      if (!res?.memberId) {
        setLocalError('Impossible d\u2019inscrire l\u2019enfant.');
        return;
      }
      showToast(
        `${res.firstName} ${res.lastName} ajouté au projet d\u2019adhésion.`,
        'success',
      );
      reset();
      onClose();
    } catch (err: unknown) {
      setLocalError(
        err instanceof Error
          ? err.message
          : 'Impossible d\u2019inscrire l\u2019enfant.',
      );
    }
  }

  if (!open) return null;

  return (
    <>
      <div
        className="mp-modal-backdrop"
        role="presentation"
        onClick={handleClose}
      />
      <div
        className="mp-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-child-title"
      >
        <h2 id="add-child-title" className="mp-modal-title">
          Ajouter un enfant au projet
        </h2>
        <p className="mp-hint mp-modal-lede">
          La formule d&rsquo;adhésion et la licence fédérale sont attribuées
          automatiquement selon l&rsquo;âge. Vous pourrez ajuster le rythme de
          règlement après ajout.
        </p>

        <label className="mp-field">
          <span>Prénom</span>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            disabled={loading}
            autoComplete="off"
          />
        </label>
        <label className="mp-field">
          <span>Nom</span>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            disabled={loading}
            autoComplete="off"
          />
        </label>

        <fieldset className="mp-fieldset">
          <legend className="mp-legend">Civilité</legend>
          <label className="mp-radio mp-radio--inline">
            <input
              type="radio"
              name="add-child-civility"
              value="MR"
              checked={civility === 'MR'}
              onChange={() => setCivility('MR')}
              disabled={loading}
            />
            <span>Monsieur</span>
          </label>
          <label className="mp-radio mp-radio--inline">
            <input
              type="radio"
              name="add-child-civility"
              value="MME"
              checked={civility === 'MME'}
              onChange={() => setCivility('MME')}
              disabled={loading}
            />
            <span>Madame</span>
          </label>
        </fieldset>

        <label className="mp-field">
          <span>Date de naissance</span>
          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            disabled={loading}
          />
        </label>

        {localError ? (
          <p className="mp-form-error" role="alert">
            {localError}
          </p>
        ) : null}

        <div className="mp-modal-actions">
          <button
            type="button"
            className="mp-btn mp-btn-outline"
            disabled={loading}
            onClick={handleClose}
          >
            Annuler
          </button>
          <button
            type="button"
            className="mp-btn mp-btn-primary"
            disabled={loading}
            onClick={() => void handleSubmit()}
          >
            {loading ? 'Ajout…' : 'Ajouter au projet'}
          </button>
        </div>
      </div>
    </>
  );
}
