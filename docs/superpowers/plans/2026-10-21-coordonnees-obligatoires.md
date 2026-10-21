# Coordonnées obligatoires à l'adhésion en ligne — 2026-10-21

Demande de Florent : à partir de la prochaine saison, l'adresse complète, le
portable (indicatif international choisi dans une liste avec drapeau, +262 et
+33 en tête) et la ville de naissance (autocomplétion) sont obligatoires pour
le compte payeur et pour chaque adhérent du foyer. Une case à cocher propose
de reprendre l'adresse du compte, une autre son portable.

## Décisions (Florent, 2026-10-21)

- **Moment** : à l'adhésion, pas à la création du compte. L'inscription
  (e-mail, Google) reste légère.
- **Existants** : la validation du panier est refusée tant qu'une fiche est
  incomplète ; un formulaire de complétion est proposé sur place.
- **Naissance** : communes françaises (DOM inclus) par autocomplétion
  geo.api.gouv.fr, code INSEE stocké ; case « Né(e) à l'étranger » : pays en
  liste + ville en texte libre.
- **Admin** : souple. Mêmes composants, rien de bloquant, badge
  « fiche incomplète ».

## Données (`apps/api/prisma/schema.prisma`, `db push`)

- `Contact` : + `addressLine`, `postalCode`, `city` (`phone` existait).
- `Member` : + `birthCity`, `birthCityInseeCode`, `birthCountryCode`.
- `MembershipCartPendingItem` : + `phone`, `addressLine`, `postalCode`,
  `city`, `birthCity`, `birthCityInseeCode`, `birthCountryCode` ; copiés
  sur le `Member` par `finalizePendingItems`.

Formats : portable **E.164** (`+262692123456`), type mobile (ou
fixe-ou-mobile pour les plans qui ne distinguent pas). Un numéro sans `+`
est refusé : `0692…` serait lu comme français. Pays en ISO 3166-1 alpha-2.
Code INSEE `^(\d{5}|2[AB]\d{3})$`, facultatif (communes fusionnées absentes
du référentiel), effacé hors France.

Règles : `apps/api/src/common/coordinates/coordinates.ts` (seule source).

## Contrat GraphQL (portail et mobile)

- `viewerRegisterChildMember(input)` : `phone`, `addressLine`, `postalCode`,
  `city`, `birthCity`, `birthCountryCode` **obligatoires**,
  `birthCityInseeCode` facultatif. Refusé si le compte payeur est incomplet.
- `viewerRegisterSelfAsMember(input)` : `birthCity`, `birthCountryCode`
  obligatoires, `birthCityInseeCode` facultatif. Portable et adresse
  repris du compte, qui doit être complet.
- `viewerCoordinatesStatus(cartId: ID)` →
  `{ account { phone addressLine postalCode city birthCity birthCityInseeCode birthCountryCode }, accountComplete, gaps { target targetId displayName missing requiresBirthPlace current { … } } }`.
  `target` ∈ `ACCOUNT | PENDING_ITEM | MEMBER`, `missing` ⊂
  `PHONE | ADDRESS | BIRTH_PLACE`. Sans `cartId` : le compte seul.
- `viewerUpdateCoordinates(input: { target, targetId, phone, addressLine, postalCode, city, birthCity, birthCityInseeCode, birthCountryCode })`
  → même forme. Lieu de naissance exigé pour `PENDING_ITEM` et `MEMBER`,
  facultatif pour `ACCOUNT`.
- `viewerValidateMembershipCart` et `viewerCheckoutMembershipCart`
  refusent un panier dont une fiche est incomplète (message qui nomme les
  personnes et ce qui manque).
- `viewerUpdateMyProfile` : un portable saisi doit être E.164 mobile ;
  profil contact : accepte `addressLine`, `postalCode`, `city` ; profil
  adhérent : accepte `birthCity`, `birthCityInseeCode`, `birthCountryCode`.

## Saisie (front)

- Portable : sélecteur de pays avec drapeau, ordre `RE`, `FR`, séparateur,
  puis tous les pays en français. Envoyer l'E.164. Pré-remplissage d'un
  ancien numéro sans indicatif : `0692`, `0693`, `0262` → `RE` ; `0639`,
  `0269` → `YT` ; sinon `FR`.
- Adresse : autocomplétion IGN Géoplateforme (successeur de
  api-adresse.data.gouv.fr)
  `https://data.geopf.fr/geocodage/search?q=…&autocomplete=1&limit=5` →
  `properties.name`, `postcode`, `city`. Saisie libre toujours possible.
- Ville de naissance (France) :
  `https://geo.api.gouv.fr/communes?nom=…&fields=nom,code,codesPostaux,codeDepartement&boost=population&limit=8`
  → `nom` (libellé), `code` (INSEE). Afficher « Saint-Pierre (974) ».
  Si la commune n'apparaît pas : texte libre, INSEE vide.
- Formulaires enfant : cases « Même adresse que le compte » et « Même
  portable que le compte », cochées par défaut quand le compte est complet ;
  les valeurs copiées sont envoyées (pas de lien persistant).
- Panier : avant « Valider et payer », lire `viewerCoordinatesStatus(cartId)`
  et proposer de compléter chaque fiche de `gaps`.
