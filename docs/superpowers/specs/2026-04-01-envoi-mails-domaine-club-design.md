# Spécification — Envoi d’e-mails (transactionnel + campagnes), domaine du club et DNS

**Date :** 2026-04-01  
**Statut :** validée par le demandeur (périmètre C + domaine club avec DNS + **blocage strict** si domaine non vérifié)  
**Périmètre :** `apps/api` (transport, webhooks, modèle), admin (`apps/admin`) pour configuration DNS et statut ; aligné sur le module **communication** existant (`apps/api/src/comms`)  
**Références :** `ClubFlow_Conception_Provisoire.md` (communication / phase F si applicable), bonnes pratiques délivrabilité (SPF, DKIM, DMARC, sous-domaines, séparation transactionnel / marketing)

---

## 1. Objectif

Permettre à chaque **club** d’**envoyer des e-mails** depuis ClubFlow en utilisant **un domaine (ou sous-domaine) contrôlé par le club**, après **vérification DNS**, pour :

1. **Messages transactionnels** (déclenchés par événements métier : ex. réinitialisation de mot de passe, confirmations, reçus — liste exacte = plan d’implémentation).  
2. **Campagnes / envois groupés** vers l’audience déjà modélisée côté `CommsService` (campagnes, groupes dynamiques).

Exiger une **séparation produit et technique** entre ces deux familles (streams, expéditeurs, en-têtes, consentement marketing) pour **maximiser la délivrabilité** et limiter le risque « spam ».

---

## 2. Décisions validées (résumé atelier)

| Sujet | Décision |
|--------|----------|
| Portée fonctionnelle | **C** — transactionnel **et** campagnes admin |
| Expéditeur | **Domaine du club** ; enregistrements DNS **fournis / confirmés** via l’ESP retenu |
| Domaine non vérifié | **A** — **aucun envoi** ; message explicite côté admin (« terminez la configuration DNS ») ; **pas** de file d’envoi différé automatique ; **pas** de domaine de repli ClubFlow dans le MVP |

---

## 3. Bonnes pratiques délivrabilité (cibles MVP)

- **Deux sous-domaines d’envoi** recommandés par club quand possible : ex. `notifications.club.fr` (transactionnel) et `campagnes.club.fr` (ou équivalent) pour **isoler la réputation**.  
- **SPF** et **DKIM** configurés selon l’ESP ; **DMARC** documenté pour le club (souvent sur le domaine parent) avec politique **progressive** (monitoring puis durcissement) — hors automatisation obligatoire dans le MVP sauf doc.  
- **Alignement** : `From` / signature DKIM / identité visible cohérents.  
- **Campagnes** : en-têtes conformes aux usages 2026 pour le **marketing** (ex. `List-Unsubscribe` là où applicable) ; **transactionnel** sans mélange de contenu promotionnel ambigu.  
- **Webhooks** ESP : bounces durs, plaintes — mise à jour d’une **liste de suppression** (au minimum pour les **campagnes** ; transactionnel : règles à préciser au plan).  
- **Pas d’envoi** depuis un serveur SMTP amateur sur l’IP de l’appli : **API ESP managé** pour le MVP.

---

## 4. Architecture technique (MVP)

- **Un** fournisseur d’e-mail (ESP) au MVP (**un seul adaptateur** dans le code) ; choix précis (Postmark, Resend, SES, etc.) = **plan d’implémentation** + variables d’environnement.  
- Couche **`MailTransport`** (interface) + implémentation **EspaceMailProviderX** : envoi unitaire / batch selon besoin, création de domaine côté ESP, demande de vérification, lecture du statut.  
- **Deux usages** logiques dans le domaine : `TRANSACTIONAL` et `CAMPAIGN` mappés vers **streams / tags / sous-domaines** selon l’ESP.  
- **Files / queue** : recommandé pour les **campagnes** (retry, débit) ; transactionnel **idempotent** (clé métier anti-doublon) où nécessaire.

---

## 5. Modèle de données (conceptuel)

À détailler au plan Prisma ; concepts minimum :

- **`ClubSendingDomain`** (nom indicatif) : `clubId`, FQDN, `purpose` (`TRANSACTIONAL` | `CAMPAIGN` | `BOTH` si un seul domaine au début), `verificationStatus` (`PENDING` | `VERIFIED` | `FAILED`), horodatages, identifiant domaine côté ESP si utile, **pas** de secrets en clair.  
- **Journal d’envoi** (facultatif MVP partiel) : club, type, message id ESP, destinataire hashé ou id, statut.  
- **Suppression / bounce** : email + club + raison + date pour **bloquer** les futures campagnes (transactionnel : exceptions métier au plan).

---

## 6. Parcours admin (configuration)

1. Page **Paramètres → E-mail / domaine d’envoi** (emplacement exact = plan UI).  
2. Saisie du **FQDN** (ex. `notifications.club-athle.fr`).  
3. Affichage des **enregistrements DNS** à créer (copier-coller), générés via l’ESP.  
4. Action **« Vérifier »** : appel API → ESP ; mise à jour du statut.  
5. Tant que `verificationStatus ≠ VERIFIED` pour le domaine requis par le type d’envoi : **mutation « envoyer campagne »** ou envoi transactionnel = **erreur métier lisible** (pas d’envoi silencieux).  
6. Documentation embarquée ou lien vers doc ClubFlow pour **DMARC** (recommandations, pas d’exécution automatique obligatoire).

---

## 7. Intégration `comms` existant

- Les **campagnes** (`MessageCampaign`, résolution d’audience dans `CommsService`) **ne passent à l’envoi réel** que si le club a un domaine **vérifié** pour le canal **CAMPAIGN** (ou `BOTH`).  
- Les **brouillons** restent créables sans domaine vérifié ; le **passage à « envoyer »** est bloqué avec message explicite.  
- Le **transactionnel** déclenché par d’autres modules applique la même règle pour le domaine **TRANSACTIONAL** (ou `BOTH`).

---

## 8. Sécurité, conformité, secrets

- Clés API ESP uniquement en **variables d’environnement** / secret manager ; rotation documentée.  
- **RGPD** : finalité des envois, base légale différenciée transactionnel / marketing, durée des journaux, droit de retrait pour le marketing.  
- **Admin** : accès réservé aux rôles déjà autorisés à piloter la communication (alignement `ClubAdminRoleGuard` ou garde plus stricte à trancher au plan).

---

## 9. Hors périmètre MVP (explicite)

- Plusieurs ESP au choix par club.  
- Domaine de repli « via ClubFlow ».  
- Envoi automatique différé quand le domaine devient vérifié sans action utilisateur.  
- BIMI / certification de marque avancée.  
- Éditeur drag-and-drop de templates complexes (HTML simple ou templates fichiers au plan).

---

## 10. Critères d’acceptation (brouillon)

- Un club avec domaine **non vérifié** ne peut **pas** envoyer de campagne ni déclencher d’e-mail transactionnel utilisant ce domaine ; l’UI et l’API retournent un **message clair**.  
- Un club avec domaine **vérifié** reçoit des e-mails avec **SPF/DKIM** conformes au fournisseur (vérifiable via outils externes).  
- Les **campagnes** et le **transactionnel** sont **distingués** dans les logs ou tags côté ESP.  
- Les **événements** de bounce/plainte critiques remontent au moins en **suppression campagne** pour l’adresse concernée.

---

## 11. Suivi

- **Plan d’implémentation :** skill *writing-plans* après relecture humaine de ce fichier.  
- **Tests :** sandbox ESP, pas de production sans domaine de test vérifié.
