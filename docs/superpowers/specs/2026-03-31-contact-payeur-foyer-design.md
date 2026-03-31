# Spec — Payeur foyer sans adhérent (`Contact`)

**Date :** 2026-03-31  
**Statut :** design validé (brainstorming), prêt pour plan d’implémentation  
**Contexte :** aujourd’hui, le rôle payeur d’un foyer (`FamilyMember` / `PAYER`) référence obligatoirement un `Member`. Les `Contact` (compte portail / prospect sans fiche adhérent) ne peuvent pas être désignés comme payeur.

## Objectif métier

Permettre qu’un **simple contact** (sans fiche `Member` dans le club) soit le **membre payeur** d’un foyer, avec une expérience portail **équivalente à un payeur adhérent**, sauf :

- pas d’accès **Ma progression** ;
- pas d’accès **Planning**.

Dès qu’un **`Member`** existe pour le même `User` dans le club, le comportement retombe sur le **flux membre adhérent** (règle **B**).

## Décisions produit (validées)

| Sujet | Décision |
|--------|-----------|
| Portail payeur non adhérent | Comme payeur adhérent, **sauf** masquage **Ma progression** et **Planning**. |
| Coexistence `Contact` + `Member` même `User` / club | **Non (B)** : si un `Member` existe, on ne s’appuie plus sur le mode « contact seulement » pour ce compte dans ce club ; lien payeur et portail alignés sur `Member`. |
| Choix technique payeur | **Approche recommandée** : étendre `FamilyMember` pour un payeur **soit** `Member`, **soit** `Contact` ; migrer automatiquement le lien payeur `Contact` → `Member` lors de la création / rattachement d’un `Member` pour ce `User`. |

## Modèle de données (cible)

### `FamilyMember`

- `linkRole = MEMBER` : uniquement `memberId` (obligatoire), pas de `contactId`.
- `linkRole = PAYER` : **exactement une** des cibles suivantes :
  - `memberId` renseigné (payeur adhérent, comportement actuel), **ou**
  - `contactId` renseigné (payeur contact seulement).
- Invariants : un seul payeur par foyer ; contraintes d’unicité adaptées (`familyId` + `memberId`, `familyId` + `contactId` selon implémentation Prisma).

### Paiements / factures

- Aujourd’hui : `Payment.paidByMemberId` → `Member`.
- **À ajouter** : `paidByContactId` optionnel (FK `Contact`), avec règle d’intégrité : au plus un des deux (`paidByMemberId`, `paidByContactId`) renseigné pour une traçabilité stricte (ajuster si le métier autorise « aucun des deux » pour certains enregistrements manuels).

### Migration Contact → Member (règle B)

Lors de la création ou du rattachement d’un `Member` pour un `User` qui est actuellement payeur via un `FamilyMember` sur `contactId` :

- **Remplacer** la ligne payeur : même foyer, `contactId` retiré, `memberId` du nouveau `Member` renseigné.
- Ne pas dupliquer le rôle payeur ; pas deux lignes `PAYER` pour le même foyer.

## Portail

- **Dérivation UI** : pour un `User` connecté au club, si **aucun** `Member` n’existe pour (`userId`, `clubId`), traiter comme **profil contact** pour la navigation :
  - masquer **Ma progression** et **Planning** ;
  - conserver le reste selon les règles actuelles de visionnage (foyer, facturation groupe, documents, etc.).
- Si un `Member` existe : navigation et droits **membre adhérent** (modules existants inchangés).

## Admin

- Sélection du payeur : choix entre **contact** du club ou **adhérent** (`Member`).
- Si l’utilisateur tente de désigner comme payeur un **contact** dont le `User` a déjà un **`Member`** dans ce club :
  - **Recommandation spec** : **refus explicite** + message invitant à sélectionner l’adhérent (évite incohérences) ; variante acceptable **auto-bascule** vers le `Member` si le produit préfère zéro friction — à figer dans le plan d’implémentation.
- Affichage fiche foyer : libellé clair « Payeur : [Contact] » vs « Payeur : [Adhérent] ».

## Erreurs et cohérence

- Interdire deux `PAYER` sur un même `Family`.
- Suppression `Contact` ou `Member` : garde-fous existants + cas payeur orphelin (message ou réaffectation selon règles club).
- Réutiliser les règles d’e-mail / doublons et le foyer étendu (`HouseholdGroup`) déjà en place ; vérifier explicitement les agrégats **viewer** / billing lors de l’implémentation.

## Tests (cibles)

- Payeur uniquement `Contact` : portail sans progression / planning ; résumés facturation cohérents.
- Après création d’un `Member` pour le même `User` : migration du lien payeur ; portail avec progression / planning selon modules.
- GraphQL / services famille : inclusion du payeur `Contact` dans les résumés et mutations admin.

## Hors périmètre (YAGNI)

- Payeur modélisé uniquement par `userId` sans `Contact`/`Member` (piste 2 du brainstorming).
- « Faux adhérent » minimal uniquement pour la facturation (piste 3).

## Suite

1. Rédiger un plan d’implémentation (skill `writing-plans`) à partir de cette spec.  
2. Revue humaine du fichier spec avant démarrage code si changements majeurs.  
3. Implémentation : Prisma, services `families` / `payments` / `viewer`, admin + portail.
