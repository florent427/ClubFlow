import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import {
  addressOf,
  isAddressComplete,
  isValidMobile,
  toE164Guess,
  VIEWER_COORDINATES_STATUS,
  VIEWER_UPDATE_COORDINATES,
  type AddressValue,
  type Coordinates,
  type CoordinatesStatus,
} from '../../lib/coordinates';
import { AddressFields } from './AddressFields';
import { PhoneField } from './PhoneField';

interface Props {
  /** Prévient le parent de l'état du compte (et de ses coordonnées). */
  onStatus: (status: { complete: boolean; account: Coordinates | null }) => void;
}

/**
 * « Vos coordonnées » : le compte payeur doit avoir un portable et une
 * adresse complète avant d'inscrire qui que ce soit. Ne s'affiche que s'il
 * manque quelque chose ; sinon il se contente de transmettre le compte.
 */
export function AccountCoordinatesCard({ onStatus }: Props) {
  const { data, loading } = useQuery<{ viewerCoordinatesStatus: CoordinatesStatus }>(
    VIEWER_COORDINATES_STATUS,
    { variables: { cartId: null }, fetchPolicy: 'cache-and-network' },
  );
  const status = data?.viewerCoordinatesStatus ?? null;
  const [save, { loading: saving }] = useMutation<{
    viewerUpdateCoordinates: CoordinatesStatus;
  }>(VIEWER_UPDATE_COORDINATES, {
    refetchQueries: [{ query: VIEWER_COORDINATES_STATUS, variables: { cartId: null } }],
    awaitRefetchQueries: true,
  });

  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState<AddressValue>(addressOf(null));
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  // Le parent passe souvent une fonction recréée à chaque rendu : la
  // garder hors des dépendances évite une boucle de rendus.
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  useEffect(() => {
    if (!status) return;
    onStatusRef.current({ complete: status.accountComplete, account: status.account });
    if (!initialized) {
      setPhone(toE164Guess(status.account.phone) ?? '');
      setAddress(addressOf(status.account));
      setInitialized(true);
    }
  }, [status, initialized]);

  if (loading && !status) return <p className="mp-hint">Chargement…</p>;
  if (!status || status.accountComplete) return null;

  async function handleSave(): Promise<void> {
    setError(null);
    if (!isValidMobile(phone)) {
      setError('Portable obligatoire : choisissez l’indicatif du pays puis saisissez le numéro.');
      return;
    }
    if (!isAddressComplete(address)) {
      setError('Adresse complète obligatoire (rue, code postal et ville).');
      return;
    }
    try {
      await save({
        variables: {
          input: { target: 'ACCOUNT', phone, ...address },
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible.');
    }
  }

  return (
    <fieldset className="mp-fieldset mp-coordinates-card">
      <legend className="mp-legend">Vos coordonnées</legend>
      <p className="mp-hint">
        Avant toute inscription, renseignez votre portable et votre adresse.
        Vous pourrez les reprendre pour chaque adhérent du foyer.
      </p>
      <PhoneField value={phone} onChange={setPhone} disabled={saving} />
      <AddressFields value={address} onChange={setAddress} disabled={saving} />
      {error ? (
        <p className="mp-form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div>
        <button
          type="button"
          className="mp-btn mp-btn-primary"
          onClick={() => void handleSave()}
          disabled={saving}
        >
          {saving ? 'Enregistrement…' : 'Enregistrer mes coordonnées'}
        </button>
      </div>
    </fieldset>
  );
}
