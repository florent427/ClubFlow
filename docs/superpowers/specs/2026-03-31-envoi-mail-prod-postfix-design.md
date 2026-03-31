# Spec — Envoi de mails réels (Postfix / Docker, domaines par club)

**Date :** 2026-03-31  
**Statut :** validé en atelier (sections 1–4)  
**Périmètre :** configuration et exploitation d’un relais SMTP réel pour la production, avec **From par domaine club**, **sans DKIM au premier déploiement**, évolution ultérieure vers DKIM et scale (VPS relais dédié).

---

## 1. Contexte et décisions produit

- **Transport applicatif :** Nest utilise **Nodemailer** et un unique **`SmtpMailTransport`** (`SMTP_*`), voir `apps/api/src/mail/providers/smtp-mail.transport.ts`.
- **Environnement cible :** **même machine** que l’API ; **Docker** pour Postgres + API + relais ; passage possible plus tard à un **VPS relais dédié** sans changer le modèle applicatif (ajustement de `SMTP_HOST` / auth).
- **Placement du relais :** recommandation **Postfix dans le même `docker-compose`** que l’API, sur un réseau bridge interne ; l’API référence le service par **nom DNS Docker** (ex. `postfix`).
- **From :** **domaine d’envoi par club** dès la prod (**pas** uniquement un domaine opérateur unique).
- **DNS :** modèle **mixte** — clubs autonomes ou accompagnement opérateur ; l’**assistant admin** reste la référence pour les enregistrements à publier.
- **DKIM :** **pas** dans la première mise en ligne ; marge de délivrabilité plus faible ; **roadmap** explicite vers OpenDKIM (ou équivalent) + intégration produit / runbook.

---

## 2. Architecture (section 1 validée)

- **Stack :** `docker-compose` : **API**, **Postgres**, **Postfix** (nom de service stable), réseau interne.
- **Ports :** API → Postfix en **25** (réseau de confiance) ou **587** + auth/TLS selon durcissement retenu dans la recette ; documenter le choix une fois pour toutes.
- **Sortie Internet :** Postfix vers MX distants ; prévoir **déblocage port 25**, **PTR / rDNS** cohérent avec **EHLO**, éventuellement IPv6 selon l’hébergeur.
- **Développement :** conserver **Mailpit** (`127.0.0.1:1025` ou service compose profil `dev`) ; pas d’obligation Postfix en local.
- **Production :** pas d’exposition pub de Mailpit ; relais réel uniquement.

### Recette Postfix minimale (exploitation)

- **Accès relais :** n’accepter la soumission **que** depuis le réseau Docker (ex. `mynetworks` = sous-réseau du compose / IP du conteneur API) — **pas** d’ouverture publique des ports **25/587** vers Internet pour la soumission applicative, sauf décision documentée et durcie.
- **Identité :** `myhostname` / **EHLO** cohérents avec le **PTR** de l’IP sortante.
- **Persistance :** volume(s) pour files d’attente / données si l’image l’exige ; procédure de **mise à jour** de l’image et rollback notée dans le runbook.
- **Garde-fous :** limites de débit ou politique anti-abus **au minimum** documentée (Postfix `smtpd_client_*`, quotas applicatifs ultérieurs).

---

## 3. Variables d’environnement (section 2 validée)

Référence principale : `apps/api/.env.example` (bloc SMTP).

| Variable | Usage |
|----------|--------|
| `SMTP_HOST` | Nom du service Postfix en prod (réseau Docker) ; Mailpit ou équivalent en dev. |
| `SMTP_PORT` | Ex. `1025` (Mailpit), `25` ou `587` (Postfix). |
| `SMTP_SECURE` | Passé tel quel à Nodemailer (`secure: true` = TLS implicite, usage typique port **465**). Pour **STARTTLS** sur **587**, `secure` est souvent `false` — le couple **port / TLS** doit suivre la recette réelle du relais, sans supposer « 587 + secure:true ». |
| `SMTP_USER` / `SMTP_PASS` | Optionnel si soumission sans auth sur réseau interne ; sinon renseigner pour 587 + SASL. |
| `MAIL_FROM_LOCAL_PART` | Partie locale du `From` ; domaine = FQDN vérifié en base. |
| `SMTP_AUTO_VERIFY_DOMAIN` | Voir section 5 — comportement critique aujourd’hui. |
| `CLUBFLOW_HOSTED_MAIL_DOMAIN` | Optionnel — sous-domaines « hébergés » opérateur. |
| `API_PUBLIC_URL` | Liens absolus dans les mails si nécessaire. |
| `ADMIN_WEB_ORIGIN`, `NODE_ENV` | CORS / prod. |

Secrets : jamais versionnés ; injection via secrets orchestrateur ou `.env` hors dépôt ; **rotation** et équivalent « secrets manager » à prévoir à terme.

**Sécurité / abus (MVP)** : pas de **secrets** ni contenu sensible des mails dans les logs ; envisager des **plafonds** d’envoi par club ou globaux ; si **587** + SASL est utilisé hors simple bridge interne, durcir l’auth et la surface réseau.

---

## 4. DNS et délivrabilité sans DKIM (section 3 validée)

- **SPF :** TXT autorisant l’**IP (ou mécanisme)** de sortie Postfix ; alignement avec le **domaine du `From`**.
- **DMARC :** recommandation MVP **`p=none`** + `rua=` pour collecter les rapports ; durcissement (`quarantine` / `reject`) après stabilisation SPF (+ DKIM plus tard).
- **DKIM :** hors scope immédiat ; la spec et le runbook réserveront la zone (sélecteur, TXT public, rechargement OpenDKIM, correspondance domaines clubs).
- **PTR :** aligner **reverse DNS** et identité annoncée par le serveur en SMTP.
- **Process mixte club / opérateur :** mêmes exigences DNS ; **runbook opérateur** pour zones gérées par l’opérateur (contrôle, propagation).
- **Enveloppe vs `From` :** sur un **mail de test** prod, vérifier l’alignement **Return-Path / enveloppe** vs domaine du **`From`** et la gestion des **rebonds** (au minimum : constat documenté pour le MVP).

---

## 5. Vérification des domaines d’envoi (section 4 validée)

### Comportement applicatif souhaité

- Pas d’envoi sans domaine **VERIFIED** pour le bon `purpose` (`getVerifiedMailProfile`).

### État actuel du transport SMTP

- `registerDomain` renvoie **`records: []`** — pas de guide DNS généré par l’API pour le mode SMTP pur.
- `refreshDomain` **ne consulte pas le DNS** : il lit uniquement `SMTP_AUTO_VERIFY_DOMAIN` (code : considéré « auto-vérifié » si la variable est **absente** ou toute valeur autre que `0` / `false` / `no`) :
  - **Mode permissif** (défaut implicite) → état **vérifié** côté snapshot **sans** preuve DNS ;
  - **Mode strict** (`false` / `0` / `no`) → snapshot **`failed: true`**, domaine en base peut passer en **FAILED** (pas seulement PENDING) → **aucun** VERIFIED → blocage des envois.

### Recommandations

1. **Documentation déploiement :** ne pas présenter le clic « Vérifier » comme une validation technique tant qu’aucune vérif DNS n’est implémentée.
2. **Évolution produit recommandée :** vérification DNS **minimale** au refresh (ex. **SPF** pour le FQDN concerné / règles d’alignement MVP) ; statuts **PENDING** / **VERIFIED** / **FAILED** cohérents ; exposition des **enregistrements attendus** (SPF, DMARC ; emplacement réservé DKIM).
3. **Palliatif avant code :** procédure opérateur manuelle (contrôle DNS externe), en acceptant que le bouton reste trompeur si `SMTP_AUTO_VERIFY_DOMAIN=true`.

### Erreurs d’envoi

- Les erreurs Nodemailer remontent déjà ; prévoir **logs** sans secrets ; pas de politique de retry avancée dans ce MVP.

---

## 6. Tests et validation

- **Local :** envoi test vers Mailpit ; contrôle dans l’UI Mailpit (port **8025**).
- **Staging / prod :** message de test vers boîte réelle ; vérifier en-têtes **Received**, **SPF** (pass/fail), absence de **DKIM** documentée ; surveiller **DMARC** agrégé.
- **Non-régression :** tests unitaires existants du transport SMTP ; à étendre lors de l’ajout de contrôles DNS.

### Critères d’acceptation (DoD) — livrable exploitable

- **Compose prod :** `api`, `db`, `postfix` démarrent ; l’API atteint Postfix **uniquement** via le réseau interne (pas d’exposition publique des ports de soumission sans décision écrite).
- **Scénario vert / ambigu :** avec comportement **actuel** et variable permissive implicite, un domaine peut passer **VERIFIED** après « Vérifier » **sans** preuve DNS (documenté comme dette) ; avec **mode strict** SMTP, constater **FAILED** et **absence** d’envoi — comportement attendu jusqu’à implémentation DNS.
- **Preuve d’envoi :** au moins un mail réel avec **SPF pass** (domaine club configuré) ou équivalent documenté si phase pré-DNS ; captures ou extrait d’en-têtes archivées pour le runbook.
- **Sécurité :** secrets hors repo ; logs sans mots de passe SMTP ni corps de mail.

---

## 7. Évolutions hors périmètre immédiat

- **DKIM :** OpenDKIM (ou équivalent), rotation de clés, synchronisation avec les domaines clubs.
- **Scale :** relais sur **VPS dédié** ; mise à jour `SMTP_HOST` et pare-feu.
- **Vérifications DNS additionnelles :** DMARC policy présente, MX si pertinent, sous-domaines d’envoi dédiés.

---

## 8. Références code

- Transport : `apps/api/src/mail/providers/smtp-mail.transport.ts`
- Domaines d’envoi : `apps/api/src/mail/club-sending-domain.service.ts`
- Exemple env : `apps/api/.env.example`
