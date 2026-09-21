import type { EditableProfileFieldKey } from './viewer-types';

/**
 * Construction de l'entrée de `viewerUpdateMyProfile`.
 *
 * Règle : **n'envoyer que ce que l'action modifie**. Un champ absent laisse
 * la valeur en place côté API ; un champ présent est réécrit et revalidé.
 *
 * C'est ce qui manquait : le formulaire renvoyait `photoUrl` alors qu'il ne
 * l'édite pas — la photo se change par ses propres boutons. Les fiches dont
 * la photo est une *data URL* héritée (39 adhérents en production, jusqu'à
 * 71 000 caractères) dépassaient alors la limite de 512 du DTO, et
 * l'enregistrement du profil était refusé pour un champ auquel l'adhérent
 * n'avait pas touché.
 */

export type SaisieProfil = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressLine: string;
  postalCode: string;
  city: string;
  /** Format `YYYY-MM-DD` tel que rendu par `<input type="date">`. */
  birthDate: string;
};

export type EntreeProfil = {
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string;
  addressLine?: string;
  postalCode?: string;
  city?: string;
  birthDate?: string;
  photoUrl?: string;
};

/**
 * Entrée du formulaire de profil.
 *
 * Un champ que le club n'expose pas est OMIS : l'API refuse d'écrire un
 * champ masqué, et l'envoyer même vide ferait échouer l'enregistrement.
 * `photoUrl` n'y figure jamais.
 */
export function entreeProfilSaisi(
  saisie: SaisieProfil,
  champsExposes: ReadonlySet<EditableProfileFieldKey>,
): EntreeProfil {
  const entree: EntreeProfil = {
    firstName: saisie.firstName.trim(),
    lastName: saisie.lastName.trim(),
    email: saisie.email.trim() || null,
  };
  if (champsExposes.has('PHONE')) {
    entree.phone = saisie.phone.trim();
  }
  if (champsExposes.has('ADDRESS_LINE')) {
    entree.addressLine = saisie.addressLine.trim();
  }
  if (champsExposes.has('POSTAL_CODE')) {
    entree.postalCode = saisie.postalCode.trim();
  }
  if (champsExposes.has('CITY')) {
    entree.city = saisie.city.trim();
  }
  // Une date vide est omise plutôt qu'envoyée : `IsDateString` refuserait
  // la chaîne vide.
  if (champsExposes.has('BIRTH_DATE') && saisie.birthDate) {
    entree.birthDate = saisie.birthDate;
  }
  return entree;
}

/**
 * Entrée des actions sur la photo : elle ne porte QUE la photo. Envoyer au
 * passage le téléphone ou l'adresse ferait échouer l'upload dans un club
 * qui ne les expose pas, pour une action qui n'a rien à voir.
 */
export function entreePhoto(photoUrl: string): EntreeProfil {
  return { photoUrl };
}
