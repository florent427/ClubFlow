# Interface Communication (Admin) — Plan d’implémentation

> **Pour exécution agentique :** skill **requis** : `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans`. Les étapes utilisent la syntaxe `- [ ]` pour le suivi.

**Objectif :** Exposer dans l’admin React (`apps/admin`) la gestion des campagnes de messages (liste, création de brouillon, envoi) en s’appuyant sur l’API GraphQL Communication déjà en place.

**Architecture :** Documents Apollo (`gql`) + types TypeScript alignés sur les réponses du resolver `CommsResolver` ; une page `CommunicationPage` en layout deux colonnes (tableau + formulaire) calquée sur `PlanningPage` ; routage `/communication` et lien sidebar actif. Aucun changement API ni Prisma dans ce périmètre.

**Tech stack :** React 19, Apollo Client 4, React Router 7, design system CSS existant (`members-*`, `members-loom`), `ToastProvider` pour le feedback.

**Spec source :** `Brief Technique IA _ Implémentation de l'Interface Communication (Admin).md` (racine du dépôt).

---

## Carte des fichiers

| Fichier | Rôle |
|---------|------|
| `apps/admin/src/lib/documents.ts` | Ajouter les 3 opérations GraphQL campagnes (query + 2 mutations). |
| `apps/admin/src/lib/types.ts` | Types `MessageCampaignsQueryData`, `CreateMessageCampaignMutationData`, `SendMessageCampaignMutationData` + alias d’enums chaîne. |
| `apps/admin/src/pages/CommunicationPage.tsx` | **Nouveau** — page liste + formulaire, `useQuery`/`useMutation`, `refetch`, `useToast`, `window.confirm` pour l’envoi. |
| `apps/admin/src/App.tsx` | Import + route `path="communication"`. |
| `apps/admin/src/components/AdminLayout.tsx` | Remplacer le lien désactivé « Communication » par un `NavLink` vers `/communication`. |

**Référence API (ne pas modifier dans ce plan) :** `apps/api/src/comms/comms.resolver.ts`, `apps/api/src/comms/dto/create-message-campaign.input.ts`, `apps/api/src/comms/models/message-campaign.model.ts`.

**Query groupes déjà existante :** `CLUB_DYNAMIC_GROUPS` dans `documents.ts` — réutiliser telle quelle pour le select audience.

---

### Tâche 1 : Documents GraphQL et types TypeScript

**Fichiers :**
- Modifier : `apps/admin/src/lib/documents.ts`
- Modifier : `apps/admin/src/lib/types.ts`
- Test : `cd apps/admin && npx tsc --noEmit`

- [ ] **Étape 1 :** En fin de `documents.ts` (après les exports existants), ajouter exactement :

```ts
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

- [ ] **Étape 2 :** En fin de `types.ts`, ajouter :

```ts
/** Aligné sur Prisma / GraphQL (CommunicationChannel, MessageCampaignStatus). */
export type CommunicationChannelStr = 'EMAIL' | 'TELEGRAM' | 'PUSH';
export type MessageCampaignStatusStr = 'DRAFT' | 'SENT';

export type MessageCampaignsQueryData = {
  clubMessageCampaigns: {
    id: string;
    title: string;
    body: string;
    channel: CommunicationChannelStr;
    dynamicGroupId: string | null;
    status: MessageCampaignStatusStr;
    sentAt: string | null;
    recipientCount: number;
  }[];
};

export type CreateMessageCampaignMutationData = {
  createClubMessageCampaign: {
    id: string;
    title: string;
    status: MessageCampaignStatusStr;
  };
};

export type SendMessageCampaignMutationData = {
  sendClubMessageCampaign: {
    id: string;
    status: MessageCampaignStatusStr;
    sentAt: string | null;
    recipientCount: number;
  };
};
```

- [ ] **Étape 3 :** Vérifier la compilation TypeScript.

Exécuter : `cd apps/admin && npx tsc --noEmit`  
Attendu : sortie vide (code 0).

- [ ] **Étape 4 :** Commit.

```bash
git add apps/admin/src/lib/documents.ts apps/admin/src/lib/types.ts
git commit -m "feat(admin): documents GraphQL et types campagnes communication"
```

---

### Tâche 2 : Page `CommunicationPage.tsx`

**Fichiers :**
- Créer : `apps/admin/src/pages/CommunicationPage.tsx`
- Test : `cd apps/admin && npx tsc --noEmit`

- [ ] **Étape 1 :** Créer le fichier avec le contenu suivant (pattern layout `members-loom` / `members-loom__grid` comme `PlanningPage.tsx`, champs formulaire en `members-field` comme `MailDomainSettingsPage.tsx`).

```tsx
import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  CLUB_DYNAMIC_GROUPS,
  CLUB_MESSAGE_CAMPAIGNS,
  CREATE_CLUB_MESSAGE_CAMPAIGN,
  SEND_CLUB_MESSAGE_CAMPAIGN,
} from '../lib/documents';
import type {
  DynamicGroupsQueryData,
  MessageCampaignsQueryData,
} from '../lib/types';
import { useToast } from '../components/ToastProvider';

const CHANNEL_OPTIONS: { value: string; label: string }[] = [
  { value: 'EMAIL', label: 'E-mail' },
  { value: 'TELEGRAM', label: 'Telegram' },
  { value: 'PUSH', label: 'Push' },
];

function channelLabel(code: string): string {
  return CHANNEL_OPTIONS.find((c) => c.value === code)?.label ?? code;
}

function statusLabel(status: string): string {
  if (status === 'DRAFT') return 'Brouillon';
  if (status === 'SENT') return 'Envoyé';
  return status;
}

function formatSentAt(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return '—';
  }
}

export function CommunicationPage() {
  const { showToast } = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [channel, setChannel] = useState('EMAIL');
  /** Chaîne vide = tous les membres (pas de `dynamicGroupId` dans la mutation). */
  const [audienceGroupId, setAudienceGroupId] = useState('');

  const { data: campaignsData, refetch: refetchCampaigns } =
    useQuery<MessageCampaignsQueryData>(CLUB_MESSAGE_CAMPAIGNS);
  const { data: groupsData } = useQuery<DynamicGroupsQueryData>(
    CLUB_DYNAMIC_GROUPS,
  );

  const [createDraft, { loading: creating }] = useMutation(
    CREATE_CLUB_MESSAGE_CAMPAIGN,
  );
  const [sendCampaign, { loading: sending }] = useMutation(
    SEND_CLUB_MESSAGE_CAMPAIGN,
  );

  const groups = groupsData?.clubDynamicGroups ?? [];
  const campaigns = campaignsData?.clubMessageCampaigns ?? [];

  const groupNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups) m.set(g.id, g.name);
    return m;
  }, [groups]);

  function audienceLabel(dynamicGroupId: string | null): string {
    if (!dynamicGroupId) return 'Tous les membres';
    return groupNameById.get(dynamicGroupId) ?? dynamicGroupId;
  }

  async function onSaveDraft(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      showToast('Titre et message sont obligatoires.', 'error');
      return;
    }
    try {
      await createDraft({
        variables: {
          input: {
            title: title.trim(),
            body: body.trim(),
            channel,
            dynamicGroupId: audienceGroupId || undefined,
          },
        },
      });
      showToast('Brouillon enregistré.', 'success');
      setTitle('');
      setBody('');
      setChannel('EMAIL');
      setAudienceGroupId('');
      await refetchCampaigns();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      showToast(msg, 'error');
    }
  }

  async function onSendNow(campaignId: string) {
    if (!window.confirm('Envoyer cette campagne maintenant ?')) return;
    try {
      await sendCampaign({ variables: { campaignId } });
      showToast('Campagne envoyée.', 'success');
      await refetchCampaigns();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      showToast(msg, 'error');
    }
  }

  return (
    <div className="members-loom">
      <header className="members-loom__hero">
        <p className="members-loom__eyebrow">Module Communication</p>
        <h1 className="members-loom__title">Communication &amp; campagnes</h1>
        <p className="members-loom__lede">
          Ciblez vos envois via les groupes dynamiques (ou tous les membres).
          Les brouillons peuvent être envoyés lorsque vous êtes prêt.
        </p>
      </header>

      <div className="members-loom__grid">
        <section className="members-panel members-panel--table">
          <h2 className="members-panel__h">Campagnes</h2>
          {campaigns.length === 0 ? (
            <p className="muted">Aucune campagne pour l’instant.</p>
          ) : (
            <div className="members-table-wrap">
              <table className="members-table">
                <thead>
                  <tr>
                    <th>Titre</th>
                    <th>Canal</th>
                    <th>Audience</th>
                    <th>Statut</th>
                    <th>Date d’envoi</th>
                    <th>Destinataires</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <span className="members-table__name">{c.title}</span>
                      </td>
                      <td>{channelLabel(c.channel)}</td>
                      <td>{audienceLabel(c.dynamicGroupId)}</td>
                      <td>{statusLabel(c.status)}</td>
                      <td>{formatSentAt(c.sentAt)}</td>
                      <td>{c.recipientCount}</td>
                      <td>
                        {c.status === 'DRAFT' ? (
                          <button
                            type="button"
                            className="members-btn members-btn--primary"
                            disabled={sending}
                            onClick={() => void onSendNow(c.id)}
                          >
                            {sending ? 'Envoi…' : 'Envoyer maintenant'}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="members-panel members-panel--aside">
          <h2 className="members-panel__h">Nouveau brouillon</h2>
          <p className="members-panel__p">
            Enregistrez un brouillon, puis envoyez-le depuis le tableau.
          </p>
          <form className="members-form" onSubmit={(e) => void onSaveDraft(e)}>
            <label className="members-field">
              <span className="members-field__label">Titre</span>
              <input
                className="members-field__input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </label>
            <label className="members-field">
              <span className="members-field__label">Message</span>
              <textarea
                className="members-field__input"
                rows={6}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
              />
            </label>
            <label className="members-field">
              <span className="members-field__label">Canal</span>
              <select
                className="members-field__input"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              >
                {CHANNEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="members-field">
              <span className="members-field__label">Audience</span>
              <select
                className="members-field__input"
                value={audienceGroupId}
                onChange={(e) => setAudienceGroupId(e.target.value)}
              >
                <option value="">Tous les membres</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="members-actions">
              <button
                type="submit"
                className="members-btn members-btn--primary"
                disabled={creating}
              >
                {creating ? 'Enregistrement…' : 'Enregistrer le brouillon'}
              </button>
            </div>
          </form>
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Étape 2 :** Compiler.

Exécuter : `cd apps/admin && npx tsc --noEmit`  
Attendu : code 0.

- [ ] **Étape 3 :** Commit.

```bash
git add apps/admin/src/pages/CommunicationPage.tsx
git commit -m "feat(admin): page communication campagnes"
```

---

### Tâche 3 : Route `/communication` dans `App.tsx`

**Fichiers :**
- Modifier : `apps/admin/src/App.tsx`

- [ ] **Étape 1 :** Ajouter l’import :

```ts
import { CommunicationPage } from './pages/CommunicationPage';
```

Ajouter la route au même niveau que `planning` (après la ligne `<Route path="planning" element={<PlanningPage />} />`) :

```tsx
<Route path="communication" element={<CommunicationPage />} />
```

- [ ] **Étape 2 :** `cd apps/admin && npx tsc --noEmit` — attendu : code 0.

- [ ] **Étape 3 :** Commit.

```bash
git add apps/admin/src/App.tsx
git commit -m "feat(admin): route /communication"
```

---

### Tâche 4 : Navigation latérale `AdminLayout.tsx`

**Fichiers :**
- Modifier : `apps/admin/src/components/AdminLayout.tsx`

- [ ] **Étape 1 :** Vérifier que `NavLink` est déjà importé depuis `react-router-dom` (utilisé ailleurs dans le fichier). Remplacer le bloc :

```tsx
<span className="cf-sidenav__link cf-sidenav__link--disabled">
  <span className="material-symbols-outlined" aria-hidden>
    campaign
  </span>
  <span>Communication</span>
</span>
```

par :

```tsx
<NavLink
  to="/communication"
  className={({ isActive }) =>
    `cf-sidenav__link${isActive ? ' cf-sidenav__link--active' : ''}`
  }
>
  <span className="material-symbols-outlined" aria-hidden>
    campaign
  </span>
  <span>Communication</span>
</NavLink>
```

- [ ] **Étape 2 :** `cd apps/admin && npx tsc --noEmit` — attendu : code 0.

- [ ] **Étape 3 :** Commit.

```bash
git add apps/admin/src/components/AdminLayout.tsx
git commit -m "feat(admin): lien sidebar communication actif"
```

---

### Tâche 5 : Vérification finale et critères d’acceptation

**Fichiers :** aucun (manuel + build).

- [ ] **Étape 1 :** Compilation admin.

Exécuter : `cd apps/admin && npx tsc --noEmit`  
Attendu : code 0 (aligné avec le brief §4).

- [ ] **Étape 2 :** Test manuel (stack local si besoin : skill `clubflow-local-dev`) : module **Communication** activé pour le club ; ouvrir `/communication` ; créer un brouillon (statut `DRAFT`) ; vérifier le tableau ; cliquer « Envoyer maintenant » sur un brouillon, confirmer ; statut passe à `SENT` et `sentAt` / `recipientCount` à jour après `refetch`.

- [ ] **Étape 3 :** Checklist brief §4 — tous les items cochés.

**Note module :** Le resolver applique `@RequireClubModule(ModuleCode.COMMUNICATION)`. Si le module est désactivé pour le club, les requêtes échoueront côté API ; le brief ne impose pas de page dédiée « module désactivé » — à traiter dans une itération UX si besoin.

---

## Revue (checklist auteur)

1. **Couverture spec :** types/documents, page, route, sidebar, toasts, `refetch`, audience « tous les membres » sans `dynamicGroupId`, confirmation envoi — couverts par les tâches 1–5.
2. **Placeholders :** aucun TBD ; code complet pour chaque fichier nouveau ou modification structurante.
3. **Cohérence des types :** `CommunicationChannelStr` / `MessageCampaignStatusStr` alignés avec Prisma ; champs GraphQL identiques au resolver.

---

**Plan enregistré sous** `docs/superpowers/plans/2026-04-04-interface-communication-admin-implementation.md`.

**Deux modes d’exécution possibles :**

1. **Subagent-driven (recommandé)** — un sous-agent par tâche, relecture entre les tâches, itération rapide. Skill **requis** : `superpowers:subagent-driven-development`.

2. **Exécution inline** — enchaîner les tâches dans la même session avec points de contrôle. Skill **requis** : `superpowers:executing-plans`.

**Quelle approche préférez-vous ?**
