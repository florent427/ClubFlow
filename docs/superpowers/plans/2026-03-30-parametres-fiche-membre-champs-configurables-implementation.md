# Plan d’implémentation — Paramètres & champs fiche membre configurables

**Spec :** `docs/superpowers/specs/2026-03-30-parametres-fiche-membre-champs-configurables-design.md`

## Phase 1 — Schéma & domaine API

1. **Prisma** : ajouter tables `ClubMemberFieldCatalogSetting`, `MemberCustomFieldDefinition`, `MemberCustomFieldValue` (noms finaux alignés sur conventions du repo).
2. **Migration** + **seed ou script** : initialiser les `ClubMemberFieldCatalogSetting` pour chaque club existant (valeurs par défaut alignées sur l’UI actuelle).
3. **Enum / union** côté code : `MemberCatalogFieldKey` (liste exhaustive des colonnes exposées à la configuration).
4. **Service** `MemberFieldConfigService` (ou sous-module de `MembersService`) : lecture config fusionnée (defaults + overrides club), validation `visibleToMember`, archivage définitions.

## Phase 2 — GraphQL

5. Types & resolvers : query agrégée pour l’admin (`clubMemberFieldSettings` / split catalogue + definitions), mutations CRUD settings catalogue, CRUD definitions (create/update/archive), extension `updateMember` / input `customFieldValues`.
6. **`MemberGraph`** : inclure `catalogFieldSettings` (optionnel, si besoin client) et `customFieldValues` pour le tiroir.
7. Guards : réutiliser admin club + module `MEMBERS`.

## Phase 3 — Admin UI — coque Paramètres

8. **`App.tsx`** : routes `settings` layout éventuel (`SettingsLayout`) ou page simple + nested `settings/member-fields`.
9. **`AdminLayout`** : lien **Paramètres** → `/settings`.
10. **`SettingsHubPage`** (`/settings`) : cartes vers sous-sections ; première carte **Fiche adhérent** → `/settings/member-fields`.
11. CSS : classes cohérentes Stitch (`cf-`).

## Phase 4 — Admin UI — configuration des champs

12. **`MemberFieldsSettingsPage`** : deux sections (catalogue + perso), formulaires liste/tri, appels GraphQL.
13. Gestion erreurs + toasts / `form-error` existants.

## Phase 5 — Fiche membre dynamique

14. **`MemberDetailDrawer`** (+ **`NewMemberPage`** si champs catalogue étendus) : charger config + rendu dynamique des champs catalogue ; bloc champs perso avec contrôles par type.
15. **`documents.ts` / types** : queries/mutations nouvelles.
16. **Annuaire** : pas de changement colonnes en V1 (sauf bugfix).

## Phase 6 — Vérification

17. `npm run build` (API + admin), tests unitaires ciblés service validation, e2e optionnel un fichier scénario court.

## Ordre suggéré

Phases 1 → 2 → 3 → 4 → 5 → 6.

## Points à trancher en cours d’impl.

- Politique **suppression / archivage** des définitions perso (spec recommande archivage).
- **SELECT** : `optionsJson` sur la définition vs table `MemberCustomFieldOption`.
- **Atomicité** : une seule mutation `updateMember` avec champs scalaires + perso vs deux appels (préférence spec : une mutation si faisable).
