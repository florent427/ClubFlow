# Brief Technique IA : Implémentation de l'Interface Communication (Admin)

> **Projet** : ClubFlow
> **Module** : Communication (Phase F)
> **Cible** : Application Admin (`apps/admin`)
> **Auteur** : Manus AI
> **Date** : 4 avril 2026

Ce document est un brief technique exhaustif destiné à un agent IA (ou un développeur) pour implémenter l'interface d'administration du module Communication. L'API GraphQL (resolvers, service, base de données) est **déjà fonctionnelle** et testée. L'objectif est de créer le front-end React dans l'application `apps/admin` en respectant scrupuleusement les conventions de code, le design system et le routage existants.

---

## 1. Contexte et Existant

Le module Communication permet d'envoyer des campagnes (e-mail, et plus tard push/SMS) ciblées via les **groupes dynamiques**.

### 1.1. L'API GraphQL existante
L'API expose déjà les opérations suivantes (voir `apps/api/src/comms/comms.resolver.ts`) :

- **Query `clubMessageCampaigns`** : Liste les campagnes du club avec leur statut (`DRAFT` ou `SENT`) et le nombre de destinataires (`recipientCount`).
- **Mutation `createClubMessageCampaign`** : Crée un brouillon. Prend en entrée `title`, `body`, `channel` (ex: `EMAIL`), et optionnellement `dynamicGroupId`.
- **Mutation `sendClubMessageCampaign`** : Déclenche l'envoi réel d'un brouillon (résolution de l'audience, agrégation parent/enfant, envoi SMTP, passage au statut `SENT`).

### 1.2. Le Design System Admin
L'application admin utilise un design system CSS pur (pas de Tailwind, pas de librairie de composants). Les classes clés à utiliser impérativement :
- **Layout de page** : `members-loom`, `members-loom__hero`, `members-loom__grid`
- **Panneaux** : `members-panel`, `members-panel__h` (titre), `members-panel__p` (texte)
- **Formulaires** : `members-form`, `members-field`, `members-field__label`, `members-field__input`, `members-actions`
- **Boutons** : `members-btn`, `members-btn--primary`
- **Tableaux** : `members-table-wrap`, `members-table`
- **Feedback** : `members-flash--success`, `members-flash--error` (ou utiliser le `ToastProvider` global)

---

## 2. Tâches à réaliser

L'agent IA devra exécuter les 4 étapes suivantes dans l'ordre.

### Étape 1 : Mettre à jour les documents GraphQL et les types
Fichiers cibles : `apps/admin/src/lib/documents.ts` et `apps/admin/src/lib/types.ts`.

**Dans `documents.ts`**, ajouter :
```graphql
export const CLUB_MESSAGE_CAMPAIGNS = gql`
  query ClubMessageCampaigns {
    clubMessageCampaigns {
      id
      title
      body
      channel
      dynamicGroupId
      status
      sentAt
      recipientCount
    }
  }
`;

export const CREATE_CLUB_MESSAGE_CAMPAIGN = gql`
  mutation CreateClubMessageCampaign($input: CreateMessageCampaignInput!) {
    createClubMessageCampaign(input: $input) {
      id
      title
      status
    }
  }
`;

export const SEND_CLUB_MESSAGE_CAMPAIGN = gql`
  mutation SendClubMessageCampaign($campaignId: ID!) {
    sendClubMessageCampaign(campaignId: $campaignId) {
      id
      status
      sentAt
      recipientCount
    }
  }
`;
```

**Dans `types.ts`**, ajouter les types correspondants (`MessageCampaignsQueryData`, `CreateMessageCampaignMutationData`, `SendMessageCampaignMutationData`) en s'alignant sur les enums Prisma (`CommunicationChannelStr = 'EMAIL' | 'TELEGRAM' | 'PUSH'`, `MessageCampaignStatusStr = 'DRAFT' | 'SENT'`).

### Étape 2 : Créer la page `CommunicationPage.tsx`
Fichier cible : `apps/admin/src/pages/CommunicationPage.tsx` (nouveau fichier).

Cette page doit suivre le pattern "Liste + Formulaire latéral" vu dans `PlanningPage.tsx`.

**Structure de la page :**
1. **Hero Header** (`members-loom__hero`) : Titre "Communication & Campagnes", description expliquant le ciblage par groupes dynamiques.
2. **Grid** (`members-loom__grid`) :
   - **Colonne gauche (Liste)** : Un `members-panel` contenant un tableau (`members-table`) listant les campagnes existantes (Titre, Canal, Audience, Statut, Date d'envoi, Destinataires).
   - **Colonne droite (Formulaire)** : Un `members-panel` contenant le formulaire de création de brouillon.

**Logique du formulaire :**
- Champs : Titre (input), Message (textarea), Canal (select, par défaut EMAIL), Audience (select listant les groupes dynamiques via la query `CLUB_DYNAMIC_GROUPS`, plus une option "Tous les membres").
- Bouton "Enregistrer le brouillon" (appelle `createClubMessageCampaign`).

**Logique d'envoi :**
- Dans le tableau, pour les campagnes au statut `DRAFT`, afficher un bouton "Envoyer maintenant".
- Au clic, demander confirmation (`window.confirm`), puis appeler `sendClubMessageCampaign`.
- Utiliser le `useToast` (importé de `../components/ToastProvider`) pour afficher le succès ou l'erreur.

### Étape 3 : Intégrer la page dans le routage
Fichier cible : `apps/admin/src/App.tsx`.

Ajouter la route `/communication` au même niveau que `/planning` ou `/contacts` :
```tsx
import { CommunicationPage } from './pages/CommunicationPage';

// Dans le composant App, sous <Route path="planning" ... /> :
<Route path="communication" element={<CommunicationPage />} />
```

### Étape 4 : Mettre à jour la navigation latérale
Fichier cible : `apps/admin/src/components/AdminLayout.tsx`.

Remplacer le lien "Bientôt" désactivé par un vrai `NavLink` :
```tsx
// Remplacer ceci :
<span className="cf-sidenav__link cf-sidenav__link--disabled">
  <span className="material-symbols-outlined" aria-hidden>campaign</span>
  <span>Communication</span>
</span>

// Par ceci :
<NavLink
  to="/communication"
  className={({ isActive }) =>
    `cf-sidenav__link${isActive ? ' cf-sidenav__link--active' : ''}`
  }
>
  <span className="material-symbols-outlined" aria-hidden>campaign</span>
  <span>Communication</span>
</NavLink>
```

---

## 3. Points d'attention critiques pour l'IA

1. **Cohérence UI** : Ne pas inventer de nouvelles classes CSS. Utiliser strictement celles listées dans la section 1.2. S'inspirer de `PlanningPage.tsx` pour le layout en deux colonnes.
2. **Gestion des erreurs** : Envelopper les appels de mutation dans des blocs `try/catch` ou utiliser les callbacks `onError` d'Apollo. Afficher les erreurs via le `ToastProvider` ou des `members-flash--error`.
3. **Groupes dynamiques** : La query `CLUB_DYNAMIC_GROUPS` doit être appelée pour peupler le select d'audience. Si l'utilisateur choisit "Tous les membres", envoyer `dynamicGroupId: undefined` ou `null` dans la mutation.
4. **Rafraîchissement** : Après la création d'un brouillon ou l'envoi d'une campagne, s'assurer d'appeler `refetch()` sur la query des campagnes pour mettre à jour le tableau et le compteur de destinataires.

---

## 4. Critères d'acceptation

- [ ] Les types et documents GraphQL sont ajoutés dans `lib/`.
- [ ] La page `/communication` s'affiche correctement avec le layout standard.
- [ ] Le formulaire permet de créer un brouillon (statut `DRAFT`).
- [ ] Le tableau liste les campagnes et affiche correctement les statuts.
- [ ] Le bouton "Envoyer" déclenche la mutation d'envoi et met à jour le statut à `SENT`.
- [ ] Le lien dans la sidebar est actif et redirige vers la bonne page.
- [ ] Le code compile sans erreur TypeScript (`npx tsc --noEmit`).
