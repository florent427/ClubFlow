import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import {
  birthPlaceOf,
  GAP_LABELS,
  isBirthPlaceComplete,
  toE164Guess,
  VIEWER_COORDINATES_STATUS,
  VIEWER_UPDATE_COORDINATES,
  type BirthPlaceValue,
  type Coordinates,
  type CoordinatesGap,
  type CoordinatesStatus,
} from '../../lib/coordinates';
import { BirthPlaceField } from './BirthPlaceField';
import {
  initialPersonCoordinates,
  PersonCoordinatesFields,
  personCoordinatesError,
  resolvePersonCoordinates,
} from './PersonCoordinatesFields';

interface Props {
  cartId: string;
  /** Nombre de fiches incomplètes : le parent bloque la validation tant qu'il est > 0. */
  onGapsCount: (count: number) => void;
}

/**
 * Fiches à compléter avant de valider le panier : le compte, les
 * inscriptions en attente et les adhérents renouvelés dont la fiche date
 * d'avant l'obligation. L'API refuse la validation tant qu'il en reste.
 */
export function CartCoordinatesGaps({ cartId, onGapsCount }: Props) {
  const { data, error, refetch } = useQuery<{ viewerCoordinatesStatus: CoordinatesStatus }>(
    VIEWER_COORDINATES_STATUS,
    { variables: { cartId }, fetchPolicy: 'cache-and-network' },
  );
  const status = data?.viewerCoordinatesStatus ?? null;
  const onGapsCountRef = useRef(onGapsCount);
  onGapsCountRef.current = onGapsCount;
  useEffect(() => {
    if (status) onGapsCountRef.current(status.gaps.length);
    // Contrôle indisponible : on ne bloque pas l'écran, l'API tranchera
    // à la validation avec un message qui nomme les fiches.
    else if (error) onGapsCountRef.current(0);
  }, [status, error]);

  if (!status || status.gaps.length === 0) return null;

  return (
    <section className="mp-coordinates-gaps" aria-label="Fiches à compléter">
      <h3 className="mp-coordinates-gaps__title">
        Coordonnées à compléter avant validation
      </h3>
      <p className="mp-hint">
        Portable, adresse complète et ville de naissance sont désormais
        obligatoires pour chaque adhérent.
      </p>
      {status.gaps.map((gap) => (
        <GapForm
          key={`${gap.target}-${gap.targetId ?? 'compte'}`}
          gap={gap}
          account={status.account}
          onSaved={() => void refetch()}
        />
      ))}
    </section>
  );
}

function GapForm({
  gap,
  account,
  onSaved,
}: {
  gap: CoordinatesGap;
  account: Coordinates;
  onSaved: () => void;
}) {
  const isAccount = gap.target === 'ACCOUNT';
  const [open, setOpen] = useState(false);
  const [person, setPerson] = useState(() => {
    const initial = initialPersonCoordinates(
      isAccount ? null : account,
      gap.current,
    );
    // Un ancien numéro sans indicatif est repris avec un indicatif deviné.
    return { ...initial, phone: initial.phone || (toE164Guess(gap.current.phone) ?? '') };
  });
  const [birthPlace, setBirthPlace] = useState<BirthPlaceValue>(
    birthPlaceOf(gap.current),
  );
  const [error, setError] = useState<string | null>(null);
  const [save, { loading }] = useMutation(VIEWER_UPDATE_COORDINATES);

  async function handleSave(): Promise<void> {
    setError(null);
    // Pour le compte lui-même, il n'y a rien à « reprendre ».
    const ref = isAccount ? null : account;
    const coordError = personCoordinatesError(person, ref);
    if (coordError) {
      setError(coordError);
      return;
    }
    if (gap.requiresBirthPlace && !isBirthPlaceComplete(birthPlace)) {
      setError('Ville et pays de naissance obligatoires.');
      return;
    }
    try {
      await save({
        variables: {
          input: {
            target: gap.target,
            targetId: gap.targetId,
            ...resolvePersonCoordinates(person, ref),
            ...(gap.requiresBirthPlace ? birthPlace : {}),
          },
        },
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible.');
    }
  }

  return (
    <div className="mp-coordinates-gap">
      <div className="mp-coordinates-gap__head">
        <div>
          <strong>{isAccount ? `${gap.displayName} (vous)` : gap.displayName}</strong>
          <small className="mp-hint">
            {' '}— à compléter : {gap.missing.map((m) => GAP_LABELS[m]).join(', ')}
          </small>
        </div>
        <button
          type="button"
          className="mp-btn mp-btn-outline"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Fermer' : 'Compléter'}
        </button>
      </div>
      {open ? (
        <div className="mp-coordinates-gap__form">
          <PersonCoordinatesFields
            account={isAccount ? null : account}
            value={person}
            onChange={setPerson}
            disabled={loading}
          />
          {gap.requiresBirthPlace ? (
            <fieldset className="mp-fieldset">
              <legend className="mp-legend">Lieu de naissance</legend>
              <BirthPlaceField
                value={birthPlace}
                onChange={setBirthPlace}
                disabled={loading}
              />
            </fieldset>
          ) : null}
          {error ? (
            <p className="mp-form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            className="mp-btn mp-btn-primary"
            onClick={() => void handleSave()}
            disabled={loading}
          >
            {loading ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
