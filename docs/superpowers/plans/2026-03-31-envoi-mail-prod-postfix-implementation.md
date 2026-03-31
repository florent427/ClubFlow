# Envoi mail production (Postfix / Docker) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre un déploiement production aligné sur la spec [2026-03-31-envoi-mail-prod-postfix-design.md](../specs/2026-03-31-envoi-mail-prod-postfix-design.md) : relais Postfix dans Docker, accès SMTP non exposé vers l’Internet pour la soumission applicative, documentation exploitable, puis vérification DNS SPF optionnelle au « Vérifier » pour réduire la dette produit.

**Dérogation DoD explicite (phase 1) :** la spec §6 exige *« api, db, postfix »* sur le réseau interne **sans** passer par l’hôte. **Ce plan livre d’abord** `db` + `postfix` + **API sur l’hôte** via **`127.0.0.1:2525`**, ce qui satisfait l’esprit *« pas d’exposition publique 25/587 pour la soumission »* mais **n’est pas** le libellé strict « uniquement réseau Docker ». La **phase 2** (hors ce plan, voir fin de document) : `Dockerfile` API + service `api` dans Compose sur le même réseau que `postfix`, sans bind localhost du SMTP.

**Architecture:** Le `docker-compose` racine ne contenait aujourd’hui que Postgres. On ajoute un service **Postfix** (image **épinglée** tag ou digest + volume spool) sur un réseau nommé, avec **profil Compose** `relay` pour ne pas imposer Postfix aux devs qui ne font tourner que la DB. Publication **127.0.0.1:2525→25** pour l’API sur l’**hôte** (workflow actuel). Côté code : couche **SPF** (Node `dns.promises`, MVP **`ip4:` uniquement** — pas de résolution `a` / `include:` récursive) dans `refreshDomain` derrière un flag d’env, et **enregistrements suggérés** dans `registerDomain`.

**Tech Stack:** Docker Compose, Postfix (image communautaire documentée dans le runbook), NestJS, Nodemailer, Node `dns/promises`, Jest.

**Spec de référence:** `docs/superpowers/specs/2026-03-31-envoi-mail-prod-postfix-design.md`

---

## Carte des fichiers

| Fichier | Rôle |
|---------|------|
| `docker-compose.yml` | Ajout réseau, service `postfix` avec **`profiles: [relay]`**, volume spool ; `db` peut rester sans profil (défaut) ou partager le réseau pour cohérence future. |
| `docs/runbooks/smtp-relay-production.md` | Runbook : variables, DNS SPF/DMARC, PTR, test Mailpit vs prod, dette vérif DNS. |
| `apps/api/.env.example` | Documenter `SMTP_PORT=2525` en prod hôte, `SMTP_PUBLIC_EGRESS_IP`, `SMTP_DNS_SPF_CHECK`, exemples Postfix. |
| `apps/api/src/mail/providers/spf-dns-check.ts` *(nouveau)* | Résoudre TXT SPF pour un FQDN ; MVP **uniquement** mécanisme `ip4:` égal à `SMTP_PUBLIC_EGRESS_IP`. |
| `apps/api/src/mail/providers/smtp-mail.transport.ts` | Brancher vérif SPF dans `refreshDomain` ; enrichir `registerDomain` avec records suggérés. |
| `apps/api/src/mail/providers/smtp-mail.transport.spec.ts` | Tests auto-verify, strict + mock DNS ou injection. |
| `apps/api/package.json` | Aucun nouveau paquet si `dns/promises` suffit. |

---

### Task 1: Compose — service Postfix + réseau + bind local

**Files:**
- Modify: `docker-compose.yml` uniquement *(runbook = Task 2 uniquement).*

- [ ] **Step 1: Ajouter un réseau nommé** `clubflow` (driver bridge). Attacher **`db`** et **`postfix`** à ce réseau (`networks: [clubflow]`) pour préparer l’API conteneurisée (phase 2).

- [ ] **Step 2: Déclarer le service `postfix`** avec `profiles: [relay]`
  - Image : image maintenue ; **épingler** `image: …:tag` ou `@sha256:…` ; noter tag + date dans le runbook (Task 2) pour mise à jour / rollback.
  - Variables d’environnement minimales selon l’image (hostname, etc.) ; écarts documentés dans le runbook.
  - **Ne pas** publier `25` sur `0.0.0.0`. Publier uniquement :
    ```yaml
    ports:
      - "127.0.0.1:2525:25"
    ```
    pour l’API sur l’hôte (`SMTP_HOST=127.0.0.1`, `SMTP_PORT=2525`).
  - Volume nommé pour la queue Postfix (ex. `clubflow_postfix_spool`).

- [ ] **Step 3: Vérifier le démarrage**

Run: `docker compose --profile relay up -d db postfix` puis `docker compose ps`  
Expected: `postfix` **healthy** ou **running** ; `127.0.0.1:2525` en écoute sur l’hôte (Windows: `netstat -ano | findstr 2525`).

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "chore(compose): service Postfix local pour relais SMTP API hôte"
```

---

### Task 2: Runbook exploitation + alignement `.env.example`

**Files:**
- Create: `docs/runbooks/smtp-relay-production.md`
- Modify: `apps/api/.env.example`

- [ ] **Step 1: Rédiger le runbook** (sections courtes, en français)
  - Démarrage : `docker compose --profile relay up -d db postfix` (les devs « DB only » gardent `docker compose up -d db`).
  - Variables API : `SMTP_HOST`, `SMTP_PORT=2525`, `SMTP_SECURE=false`, débit **interne**.
  - Rappel **PTR / EHLO**, SPF, DMARC `p=none`, DKIM hors scope.
  - **Enveloppe / Return-Path** : checklist « mail de test prod » — comparer **Return-Path** (enveloppe) et domaine du **From** ; consigner le constat (aligné spec §4).
  - **Anti-abus** : au minimum, renvoi vers paramètres Postfix type `smtpd_client_message_rate_limit` / documentation extérie ; dette quotas applicatifs (spec §2).
  - **Limitation actuelle** : bouton « Vérifier » sans SPF tant que `SMTP_DNS_SPF_CHECK` non activé ; lien vers spec §5–6.
  - **Dérogation DoD phase 1** : paragraphe qui renvoie au header de ce plan (API hôte vs réseau interne strict).
  - Checklist DoD reprise de la spec (preuve d’envoi, pas de secrets dans les logs).

- [ ] **Step 2: Mettre à jour `apps/api/.env.example`**
  - Bloc commenté « Prod (API sur hôte, Postfix compose) » avec `SMTP_HOST=127.0.0.1`, `SMTP_PORT=2525`.
  - Nouvelles variables documentées :
    - `SMTP_PUBLIC_EGRESS_IP` — IPv4 publique utilisée par Postfix pour sortir (pour contrôle SPF MVP).
    - `SMTP_DNS_SPF_CHECK` — `true` / `false` : si `true`, `refreshDomain` exige SPF aligné (voir Task 3).

- [ ] **Step 3: Commit**

```bash
git add docs/runbooks/smtp-relay-production.md apps/api/.env.example
git commit -m "docs: runbook relais SMTP prod et variables SPF"
```

---

### Task 3 (TDD): Contrôle SPF minimal dans `SmtpMailTransport`

**Files:**
- Create: `apps/api/src/mail/providers/spf-dns-check.ts`
- Modify: `apps/api/src/mail/providers/smtp-mail.transport.ts`
- Modify: `apps/api/src/mail/providers/smtp-mail.transport.spec.ts`

- [ ] **Step 1: Test — mode DNS SPF désactivé, comportement inchangé**

Dans `smtp-mail.transport.spec.ts`, avec `SMTP_DNS_SPF_CHECK` absent et `SMTP_AUTO_VERIFY_DOMAIN=true`, `refreshDomain` reste **verified**.

- [ ] **Step 2: Run test**

Run: `cd apps/api && npm test -- smtp-mail.transport.spec.ts`  
Expected: PASS.

- [ ] **Step 3: Test — SPF check activé sans IP publique configurée**

Avec `SMTP_DNS_SPF_CHECK=true` et `SMTP_PUBLIC_EGRESS_IP` vide, `refreshDomain` doit retourner `verified: false`, `failed: true` (ou PENDING côté service — ici le transport renvoie `failed: true` comme le mode strict actuel ; le service mappe en FAILED).

- [ ] **Step 4: Implémenter `checkSpfIncludesEgressIp(fqdn, ip)`**
  - Utiliser `import { promises as dns } from 'node:dns';` et `dns.resolveTxt`.
  - Concaténer les segments TXT, parser les enregistrements `v=spf1`.
  - **MVP (unique mécanisme supporté) :** le TXT SPF agrégé doit contenir le littéral `ip4:<SMTP_PUBLIC_EGRESS_IP>` (égalité stricte après normalisation IPv4). **Pas** de support `include:`, `a`, `mx` dans la v1 — documenté dans le runbook comme limite.
  - Si aucun SPF valide ou pas de `ip4:` correspondant : échec de la vérif.

- [ ] **Step 5: Intégrer dans `refreshDomain`**
  - Si `process.env.SMTP_DNS_SPF_CHECK === 'true'` :
    - Lire `SMTP_PUBLIC_EGRESS_IP`.
    - Si IP manquante → `verified: false`, `failed: true`, `records` peut inclure un message synthétique dans un champ texte *ou* garder `records: []` et logger (préférer enrichir `records` avec une ligne type `TXT` suggestion si l’interface l’affiche).
    - Sinon appeler `checkSpfIncludesEgressIp(fqdn, ip)` ; si OK → `verified: true`, `failed: false` **même** si `SMTP_AUTO_VERIFY_DOMAIN=false` (la vérif DNS prime quand SPF check activé — **décision :** lorsque `SMTP_DNS_SPF_CHECK=true`, ignorer le seul flag auto-verify pour le chemin succès ; si SPF KO → failed).
  - Si `SMTP_DNS_SPF_CHECK` ≠ `true`, conserver la logique **actuelle** (`smtpAutoVerifyDomain`).

- [ ] **Step 6: Tests unitaires SPF** — mock `dns.resolveTxt` via `jest.mock('node:dns')` ou injecter une fonction resolver (si refactor minime pour testabilité, privilégier paramètre optionnel).

- [ ] **Step 7: Run full API tests mail**

Run (PowerShell / cross-shell sûr) :  
`cd apps/api; npm test -- --testPathPattern="smtp-mail"` puis si fichier dédié : `npm test -- --testPathPattern="spf-dns"`  
Expected: ALL PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/mail/providers/spf-dns-check.ts apps/api/src/mail/providers/smtp-mail.transport.ts apps/api/src/mail/providers/smtp-mail.transport.spec.ts
git commit -m "feat(mail): option SMTP_DNS_SPF_CHECK pour vérification domaine"
```

---

### Task 4: Enregistrements DNS suggérés à l’enregistrement du domaine

**Files:**
- Modify: `apps/api/src/mail/providers/smtp-mail.transport.ts`
- Modify: `apps/api/src/mail/providers/smtp-mail.transport.spec.ts`
- Modify: `apps/api/.env.example`

- [ ] **Step 1: Test attendu** — `registerDomain('club.example')` retourne `records` non vide lorsque `SMTP_PUBLIC_EGRESS_IP` et éventuellement `SMTP_SPF_PTR_DOMAIN` *(optionnel)* sont définis ; sinon `records` peut rester vide.

- [ ] **Step 2: Implémenter** des entrées synthétiques pour l’admin (types alignés sur `MailDnsRecordGraph` ou structure existante JSON) :
  - TXT SPF suggéré : `v=spf1 ip4:<SMTP_PUBLIC_EGRESS_IP> -all` (ou `~all` si documenté comme phase de test — **documenter dans runbook**, défaut strict `-all` seulement si l’opérateur confirme la stabilité de l’IP sortante).
  - TXT DMARC suggéré : `v=DMARC1; p=none; rua=mailto:...` avec placeholder `mailto:...` lu depuis `SMTP_DMARC_RUA_EMAIL` optionnel.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/mail/providers/smtp-mail.transport.ts apps/api/src/mail/providers/smtp-mail.transport.spec.ts apps/api/.env.example
git commit -m "feat(mail): enregistrements SPF/DMARC suggérés pour mode SMTP"
```

---

### Task 5: Validation manuelle (DoD)

- [ ] **Step 1:** `docker compose --profile relay up -d db postfix` ; API locale `.env` avec `SMTP_HOST=127.0.0.1`, `SMTP_PORT=2525`, `SMTP_DNS_SPF_CHECK=false` ; envoyer un mail test (mutation existante) → selon config Postfix, mail reçu ou log queue.

- [ ] **Step 2:** Activer `SMTP_DNS_SPF_CHECK=true` sur un domaine de test dont le DNS public contient le bon SPF ; « Vérifier » → VERIFIED ; puis cas négatif sans SPF → FAILED.

- [ ] **Step 3:** `cd apps/api && npm run build` — Expected: succès.

- [ ] **Step 4:** Commit final doc si ajustements runbook après test.

```bash
git add docs/runbooks/smtp-relay-production.md
git commit -m "docs: ajustements runbook après validation manuelle"
```

---

## Phase 2 (hors périmètre immédiat — alignement DoD strict spec §6)

- Ajouter un **`Dockerfile`** pour `apps/api` et un service **`api`** dans Compose sur `clubflow` ; `SMTP_HOST=postfix` (nom du service), **sans** `ports` publiés pour SMTP ; retirer ou garder `127.0.0.1:2525` seulement pour debug documenté.

## Hors plan (rappel spec §7)

- DKIM / OpenDKIM.
- Parser SPF complet (`include:` récursif, `mx`, `a` multi).

---

## Review

Plan relu une première fois — corrections intégrées (DoD / profils / runbook / SPF MVP `ip4` uniquement / Return-Path / image épinglée). Ré-exécuter une relecture légère avant grosse implémentation si nécessaire.
