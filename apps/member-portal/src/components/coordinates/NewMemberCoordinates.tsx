import { useCallback, useState } from 'react';
import {
  birthPlaceOf,
  isBirthPlaceComplete,
  type BirthPlaceValue,
  type Coordinates,
} from '../../lib/coordinates';
import { AccountCoordinatesCard } from './AccountCoordinatesCard';
import { BirthPlaceField } from './BirthPlaceField';
import {
  initialPersonCoordinates,
  PersonCoordinatesFields,
  personCoordinatesError,
  resolvePersonCoordinates,
  type PersonCoordinatesValue,
} from './PersonCoordinatesFields';

/**
 * État des coordonnées d'une nouvelle inscription (enfant ou soi-même),
 * à brancher dans les formulaires d'ajout au panier.
 *
 * `withPersonCoordinates` : faux pour l'auto-inscription, où l'adhérent est
 * le titulaire du compte et reprend donc ses coordonnées côté API.
 */
export function useNewMemberCoordinates(withPersonCoordinates: boolean) {
  const [account, setAccount] = useState<Coordinates | null>(null);
  const [accountComplete, setAccountComplete] = useState(false);
  const [person, setPerson] = useState<PersonCoordinatesValue>(() =>
    initialPersonCoordinates(null),
  );
  const [personTouched, setPersonTouched] = useState(false);
  const [birthPlace, setBirthPlace] = useState<BirthPlaceValue>(birthPlaceOf(null));

  const onAccountStatus = useCallback(
    (s: { complete: boolean; account: Coordinates | null }) => {
      setAccountComplete(s.complete);
      setAccount(s.account);
      // Cases « mêmes coordonnées » cochées d'office dès que le compte est
      // complet, tant que l'utilisateur n'y a pas touché.
      if (!personTouched) setPerson(initialPersonCoordinates(s.account));
    },
    [personTouched],
  );

  function reset(): void {
    setPerson(initialPersonCoordinates(account));
    setPersonTouched(false);
    setBirthPlace(birthPlaceOf(null));
  }

  /** Message d'erreur, ou null si tout est prêt à partir. */
  function validate(): string | null {
    if (!accountComplete) {
      return 'Enregistrez d’abord vos coordonnées (portable et adresse).';
    }
    if (withPersonCoordinates) {
      const e = personCoordinatesError(person, account);
      if (e) return e;
    }
    if (!isBirthPlaceComplete(birthPlace)) {
      return 'Ville et pays de naissance obligatoires.';
    }
    return null;
  }

  /** Champs à ajouter à l'input de la mutation d'inscription. */
  function payload() {
    return {
      ...(withPersonCoordinates ? resolvePersonCoordinates(person, account) : {}),
      birthCity: birthPlace.birthCity.trim(),
      birthCityInseeCode: birthPlace.birthCityInseeCode,
      birthCountryCode: birthPlace.birthCountryCode,
    };
  }

  const fieldsProps = {
    withPersonCoordinates,
    account,
    accountComplete,
    onAccountStatus,
    person,
    onPersonChange: (v: PersonCoordinatesValue) => {
      setPersonTouched(true);
      setPerson(v);
    },
    birthPlace,
    onBirthPlaceChange: setBirthPlace,
  };

  return { fieldsProps, validate, payload, reset, accountComplete };
}

type FieldsProps = ReturnType<typeof useNewMemberCoordinates>['fieldsProps'] & {
  disabled?: boolean;
};

export function NewMemberCoordinatesFields({
  withPersonCoordinates,
  account,
  accountComplete,
  onAccountStatus,
  person,
  onPersonChange,
  birthPlace,
  onBirthPlaceChange,
  disabled,
}: FieldsProps) {
  return (
    <>
      <AccountCoordinatesCard onStatus={onAccountStatus} />
      <fieldset className="mp-fieldset">
        <legend className="mp-legend">Lieu de naissance</legend>
        <BirthPlaceField
          value={birthPlace}
          onChange={onBirthPlaceChange}
          disabled={disabled}
        />
      </fieldset>
      {withPersonCoordinates && accountComplete ? (
        <PersonCoordinatesFields
          account={account}
          value={person}
          onChange={onPersonChange}
          disabled={disabled}
        />
      ) : null}
    </>
  );
}
