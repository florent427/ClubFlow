# budgetperso — budget des vacances de janvier 2027

Application personnelle de Florent, servie sur **https://sksr.re/budgetperso**.
Elle n'a aucun lien avec le code ClubFlow (ni API, ni base Postgres) : elle
profite seulement du domaine `sksr.re`, du serveur de prod et du relais SMTP
Brevo.

- Budget prévisionnel jour par jour (06 → 26/01/2027), validé le 2026-11-05 :
  repas divisés par deux, frais de véhicule (carburant, péages, parkings)
  partagés 4/6, marge de 10 % sur les postes estimés seulement (shopping,
  Disney et ski sont des enveloppes fixes, sans marge). Total : 7 096 €.
- Saisie des dépenses réelles sur téléphone, avec l'écart par jour et par poste.
- **Hors ligne** : l'état complet et la file des saisies vivent dans le
  `localStorage` ; un service worker garde l'interface. La file part au retour
  du réseau (l'Andorre n'a pas le roaming UE).
- Accès par **lien magique** envoyé par e-mail, aux seules adresses de
  `BUDGET_USERS`. Retirer une adresse coupe aussi ses sessions ouvertes.

## Stack

Node ≥ 20.6 sans build : `node:http`, `better-sqlite3` (fichier SQLite),
`nodemailer`. Front en JS natif (`public/`), sans framework.
`public/model.js` (validation, calcul du budget) est partagé entre le
navigateur et le serveur.

Les montants sont des centimes entiers ; `share` est la part de la facture que
la famille paie (1, 4/6, 0,5…). Les lignes prévues et les réglages ne sont
semés qu'une fois (`lib/seed-data.js`) : les modifications faites dans l'app ne
sont jamais écrasées au redémarrage. Les jours, eux, suivent toujours le code.

## En local

```bash
cd apps/budgetperso
npm ci
cp .env.example .env   # sans SMTP_HOST, le lien de connexion s'affiche dans le terminal
npm run dev            # http://localhost:5180/budgetperso
npm test
```

## Production

| | |
|---|---|
| Service | `clubflow-budgetperso.service`, port 5180 (127.0.0.1) |
| Code | `/home/clubflow/clubflow/apps/budgetperso` (déployé par `bin/clubflow-deploy.sh`) |
| Données | `/home/clubflow/budgetperso-data/budget.db` (hors du dépôt) |
| Config | `/home/clubflow/budgetperso-data/budgetperso.env` (chmod 600) |
| Logs | `/var/log/clubflow-budgetperso.log` |

### Installation (une seule fois)

1. Fichier d'environnement, en reprenant les valeurs SMTP de
   `apps/api/.env` (mêmes identifiants Brevo) :

   ```bash
   mkdir -p /home/clubflow/budgetperso-data
   cat > /home/clubflow/budgetperso-data/budgetperso.env <<'EOF'
   PORT=5180
   PUBLIC_URL=https://sksr.re/budgetperso
   TRUST_PROXY=true
   DB_PATH=/home/clubflow/budgetperso-data/budget.db
   BUDGET_USERS=florent.morel427@gmail.com:Florent,<e-mail de Nelly>:Nelly
   SMTP_HOST=smtp-relay.brevo.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=...
   SMTP_PASS=...
   MAIL_FROM=Budget vacances <noreply@clubflow.topdigital.re>
   EOF
   chmod 600 /home/clubflow/budgetperso-data/budgetperso.env
   ```

2. Dépendances et service :

   ```bash
   cd /home/clubflow/clubflow/apps/budgetperso && npm ci --omit=dev
   sudo cp deploy/clubflow-budgetperso.service /etc/systemd/system/
   sudo systemctl daemon-reload && sudo systemctl enable --now clubflow-budgetperso
   ```

3. Caddy : appliquer `deploy/Caddyfile.snippet` dans le bloc `sksr.re`, puis
   `sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy`.
   ⚠️ Sans l'exclusion `not path /budgetperso*`, Souin mettrait les réponses
   en cache public (la vitrine réécrit `Cache-Control`).

Ensuite, chaque déploiement de `main` refait `npm ci` et redémarre le service
(étape 5b de `bin/clubflow-deploy.sh`, active dès que l'unit existe).

### Ajouter une personne

Ajouter `email:Prénom` à `BUDGET_USERS` dans `budgetperso.env`, puis
`sudo systemctl restart clubflow-budgetperso`.

### Sauvegarde

Le fichier SQLite n'est pas dans le `pg_dump` quotidien. Copie à chaud, à la
main, sans dépendre de la CLI `sqlite3` :

```bash
cd /home/clubflow/clubflow/apps/budgetperso
node -e "require('better-sqlite3')(process.argv[1]).backup(process.argv[2])" \
  /home/clubflow/budgetperso-data/budget.db /home/clubflow/budgetperso-data/budget-$(date +%F).db
```
