# Addendum — Back-office : adhésion & groupes dynamiques

**Date :** 2026-03-30  
**Statut :** validé rédactionnellement ; relecture technique intégrée (2026-03-30)  
**Document parent :** [2026-03-30-adhesion-tarifs-groupes-remises-coupons-design.md](./2026-03-30-adhesion-tarifs-groupes-remises-coupons-design.md)

## 1. Objectif

Rendre **utilisable dans `apps/admin`** le domaine déjà implémenté côté API : **groupes dynamiques** (CRUD + suggestion + affectations membre), **saisons club**, **formules d’adhésion**, **cotisation** (brouillon `DRAFT` → finalisation `OPEN` avec `lockedPaymentMethod`).

**Périmètre V1 (brainstorming) :** option **C** — flux complet dans le back-office.

## 2. Organisation navigation (référentiel / opérationnel)

| Zone | Route | Contenu |
|------|--------|---------|
| Membres | `/members/dynamic-groups` | Liste et CRUD des groupes (âge, grades), patterns proches de `MembersGradesPage`. |
| Membres | Fiche membre (tiroir) | Bloc **Groupes dynamiques** : affectations, suggestion, enregistrement (voir §6). |
| Membres | Fiche membre | **Assistant cotisation** (voir §5). |
| Paramètres | `/settings/adhesion` | **Saisons** et **Formules** ; lien ou rappel vers les groupes dynamiques sous Membres. |

## 3. Modules club & comportement UI

Le resolver **Membership** (saisons, produits, brouillon/finalisation) est sous **`RequireClubModule(PAYMENT)`**. Le resolver **Membres** (dont groupes dynamiques et affectations) est sous **`RequireClubModule(MEMBERS)`**.

| Fonctionnalité UI | Module requis | Si module absent côté club |
|-------------------|---------------|----------------------------|
| `/members/dynamic-groups`, suggestion, `setMemberDynamicGroups` | `MEMBERS` | Écran ou actions masqués ; message d’activation (pattern existant admin). |
| `/settings/adhesion`, assistant cotisation, mutations adhésion | `PAYMENT` | Hub adhésion masqué ou remplacé par message ; **pas** de contournement ; le bloc cotisation sur fiche membre **masqué** ou désactivé avec la même explication. |
| Lecture `clubDynamicGroups` pour annuaire / planning | `MEMBERS` (déjà le cas pour ces écrans) | Inchangé. |

**Saison active :** l’API impose **au plus une** saison avec `isActive` par club. Si **aucune** saison active : bannière globale ou callout sur l’hub adhésion (« Créez ou activez une saison ») ; **bloc cotisation** sur fiche membre **désactivé** avec le même libellé que l’erreur API : *Aucune saison active : créez ou activez une saison avant la cotisation.* Si `activeClubSeason` est `null` alors que des saisons existent, guider vers l’activation dans Paramètres.

## 4. Surface GraphQL (noms exposés NestJS)

**Alignement document parent :** la requête de suggestion s’appelle en **GraphQL** `suggestMemberDynamicGroups` (et non le libellé générique `suggestDynamicGroupsForMember` du parent §6).

| Domaine | Opérations |
|---------|------------|
| Groupes (Membres) | `clubDynamicGroups`, `createClubDynamicGroup`, `updateClubDynamicGroup`, `deleteClubDynamicGroup` |
| Affectations | `suggestMemberDynamicGroups(memberId)`, `setMemberDynamicGroups(input)` |
| Saisons / formules / facture | `clubSeasons`, `activeClubSeason`, `createClubSeason`, `updateClubSeason`, `membershipProducts`, `createMembershipProduct`, `updateMembershipProduct`, `createMembershipInvoiceDraft`, `finalizeMembershipInvoice` |
| Modes de paiement (liste UX) | `clubPricingRules` : en V1, proposer en priorité les `method` pour lesquels une règle existe ; **toute** valeur `ClubPaymentMethod` reste acceptée par `finalizeMembershipInvoice` (règle `null` = pas d’ajustement dans `applyPricing`). Documenter libellés français alignés sur l’enum. |

## 5. Assistant cotisation — parcours détaillé

1. **Entrée** : bouton sur fiche membre si `MEMBERS` **et** `PAYMENT` actifs **et** saison active (sinon message + lien vers `/settings/adhesion`).

2. **Formule** : liste des `membershipProducts` non archivés dont le `dynamicGroupId` est parmi les groupes **assignés** au membre. Si vide : texte d’aide (assigner un groupe / créer une formule).

3. **Champs brouillon** (alignés sur `CreateMembershipInvoiceDraftInput`) :

   - `effectiveDate` (obligatoire), `prorataPercentBp` (optionnel, 0–10 000).
   - Aide publique : `publicAidAmountCents` si `allowPublicAid` ; `publicAidOrganisme`, `publicAidReference`, `publicAidAttachmentUrl` optionnels (URL ; pas d’upload fichier V1 sauf évolution API).
   - Remise exceptionnelle : uniquement si `allowExceptional` **et** autorisation serveur (`assertExceptionalDiscountAllowed`) ; **motif** + **montant** obligatoires si la remise est utilisée (erreur API sinon). Masquer le bloc si l’utilisateur n’est pas éligible ; à terme, affiner avec un rôle exposé dans le JWT / profil admin lorsqu’il existera.

4. **Créer le brouillon** : `createMembershipInvoiceDraft`. Afficher totaux / lignes : soit champs retournés si la query facture enrichie existe, soit **refetch** `clubInvoices` / détail facture selon ce que l’admin expose déjà.

   **Cycle de vie V1 :** l’API ne vérifie pas l’unicité d’un brouillon par membre/saison ; plusieurs `DRAFT` peuvent coexister. L’UI doit au minimum **informer** après création (ex. lien « voir cette facture »). Si plus tard une contrainte ou mutation « annuler brouillon » est ajoutée, adapter sans changer le flux principal.

5. **Finalisation** : choix de `lockedPaymentMethod` puis `finalizeMembershipInvoice`. Rappel : **aucun paiement manuel** sur facture `DRAFT` (rejet côté API).

6. Succès : facture `OPEN`, `amountCents` après `ClubPricingRule` ; inciter au refetch des listes de factures.

## 6. Suggestion de groupes — UX (parent §4.1)

La suggestion **ne remplace pas** les affectations persistées tant que l’admin n’a pas validé :

- Action **Suggérer** → charge `suggestMemberDynamicGroups` → présenter les ids proposés (cases cochées ou liste) **en pré-sélection** ou dans un panneau « Proposition ».
- **Enregistrer** envoie explicitement `setMemberDynamicGroups` avec la liste choisie (y compris si l’admin a fusionné suggestion + groupes existants).
- Éviter tout enregistrement automatique au seul chargement de la fiche.

## 7. Données front (Apollo)

- Nouvelles opérations dans `apps/admin/src/lib/documents.ts`, types dans `types.ts` (ou codegen si introduit plus tard — rester cohérent avec le dépôt).
- Après mutations critiques : **refetch** ciblé (`fetchPolicy: 'network-only'` ou `refetchQueries`) pour membres, factures, `membershipProducts`, `clubSeasons` ; **pas** d’optimistic update sur les montants de cotisation.
- Erreurs : surface API (`BadRequestException`, etc.) via `graphQLErrors` + toasts ou bandeaux ; états **loading / empty / error** par panneau.

## 8. Tests & Definition of Done

- **Manuel** : parcours bout-en-bout groupe → formule → saison active → affectation → cotisation jusqu’à `OPEN`.
- **Non-régression** : écrans utilisant `clubDynamicGroups` (annuaire, dashboard, planning).
- **Complément souhaitable** : petit test (RTL ou util) sur un hook ou composant qui enchaîne brouillon + finalisation avec mocks Apollo, ou e2e optionnel.
- **DoD** : routes + entrées menu ; blocs fiche membre ; garde-modules et saisons actives visibles ; champs obligatoires exceptionnelle / aide publique respectés.

## 9. Hors scope addendum

Portail adhérent ; query `previewMembershipInvoice` sans persistance si absente de l’API ; annulation / fusion de brouillons au-delà du comportement actuel (voir §5).
