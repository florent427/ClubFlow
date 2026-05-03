# Runbook — Seeder les pages vitrine d'un club

> Référencé par `runbooks/deploy.md`. À utiliser quand la vitrine renvoie 404
> sur les routes (`/`, `/stages`, `/contact`, etc.) alors que le déploiement
> a réussi.

## Symptôme

```
GET https://sksr.re/ → 404
GET https://sksr.re/stages → 404
```

Pourtant `clubflow-vitrine.service` tourne, le build Next.js a réussi.

## Cause

La vitrine Next.js charge le contenu **depuis la DB via GraphQL** au build
(SSG/ISR). Si la table `VitrinePage` est vide pour ce club, Next.js génère
le 404 statique.

## Procédure : seeder les pages depuis l'admin

1. Connecté à https://clubflow.topdigital.re comme admin du club
2. Vitrine → Pages → "Nouvelle page"
3. Créer au minimum :
   - `/` (Accueil) — slug vide
   - `/stages` — liste des stages
   - `/tarifs` — grille tarifaire
   - `/contact` — formulaire contact
   - `/mentions-legales`
4. Pour chaque page, publier (status `PUBLISHED`)

## Procédure : seeder via SQL direct (si pas d'UI)

⚠️ Pour debug uniquement. Préférer la procédure UI.

```bash
ssh-into-prod "
  CLUB_ID='a8a1041c-ec1e-4e4d-a1cc-cd58247cf982'
  sudo -u postgres psql clubflow <<SQL
INSERT INTO \"VitrinePage\" (id, \"clubId\", slug, title, status, \"createdAt\", \"updatedAt\")
VALUES
  (gen_random_uuid(), '\$CLUB_ID', '', 'Accueil', 'PUBLISHED', now(), now()),
  (gen_random_uuid(), '\$CLUB_ID', 'stages', 'Stages', 'PUBLISHED', now(), now()),
  (gen_random_uuid(), '\$CLUB_ID', 'tarifs', 'Tarifs', 'PUBLISHED', now(), now()),
  (gen_random_uuid(), '\$CLUB_ID', 'contact', 'Contact', 'PUBLISHED', now(), now())
ON CONFLICT DO NOTHING;
SQL
"
```

⚠️ Schéma simplifié — vérifier les colonnes exactes avant insertion :

```bash
ssh-into-prod "sudo -u postgres psql clubflow -c '\d \"VitrinePage\"'"
```

## ⚠️ ÉTAPE CRITIQUE — flush cache Next.js

Insérer la page en DB ne suffit PAS. Next.js cache les 404 (cf. ISR).
**Forcer un rebuild complet** :

```bash
ssh-into-prod "
  cd /home/clubflow/clubflow/apps/vitrine
  rm -rf .next/cache .next
  npm run build
  sudo systemctl restart clubflow-vitrine
"
```

→ Si on skip cette étape, les 404 persistent.
Cf. `pitfalls/nextjs-isr-cache-stale.md`.

## Smoke test

```bash
for path in '/' '/stages' '/tarifs' '/contact'; do
  echo "$(curl -s -o /dev/null -w '%{http_code}' https://sksr.re$path) $path"
done
```

Tous → `200`.

## Migrer le contenu depuis local vers prod

Si on a déjà créé les pages en local et qu'on veut les pousser en prod :

```bash
# 1. Dump des tables vitrine en local
pg_dump -Fc -t '"VitrinePage"' -t '"VitrineSection"' -t '"VitrineBlock"' \
  -h localhost -U clubflow clubflow > /tmp/vitrine-content.dump

# 2. Upload vers serveur
scp /tmp/vitrine-content.dump clubflow@89.167.79.253:/tmp/

# 3. Restore (sur serveur, attention : fusion, pas remplacement)
ssh-into-prod "sudo -u postgres pg_restore -a -d clubflow /tmp/vitrine-content.dump"
```

⚠️ `pg_restore -a` (data only) écrasera les rows en conflit ID. Mieux :
exporter en SQL `INSERT ... ON CONFLICT` ou utiliser une procédure
métier dédiée (si elle existe : `npm run db:seed:vitrine`).

Puis flush cache + restart vitrine (cf. ci-dessus).
