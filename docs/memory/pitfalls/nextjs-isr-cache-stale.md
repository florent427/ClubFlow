# Piège — Next.js ISR cache stale après insert DB

## Symptôme

```
GET https://sksr.re/stages → 404
```

Pourtant :
- `clubflow-vitrine.service` tourne
- `SELECT * FROM "VitrinePage" WHERE slug = 'stages'` retourne bien la row
- L'admin web montre la page comme `PUBLISHED`

## Contexte

La vitrine Next.js (Next 15 App Router) utilise :
- `generateStaticParams()` au build → fige les routes valides
- `revalidate = 60` (ISR) → re-génère en background mais **404 reste 404**
  jusqu'au build suivant si la route n'existait pas au build initial

## Cause root

Quand on `npm run build` puis qu'on insère une nouvelle `VitrinePage`
en DB, Next.js a déjà figé sa table de routes valides. La nouvelle
route n'est pas dans le manifest, et Next.js renvoie le 404 statique
**de manière permanente** jusqu'au prochain rebuild.

Pire : `.next/cache` retient le 404 même après suppression de `.next/`
si on ne supprime pas explicitement le cache.

## Solution

**Toujours rebuild ET flush cache après insertion de pages vitrine** :

```bash
ssh-into-prod "
  cd /home/clubflow/clubflow/apps/vitrine
  rm -rf .next/cache .next
  npm run build
  sudo systemctl restart clubflow-vitrine
"
```

⚠️ `rm -rf .next` seul **ne suffit pas** sur certaines versions de
Next.js — il faut aussi `.next/cache` qui peut survivre dans certains
scénarios.

## Variante : revalidation à la demande

Next.js supporte `revalidatePath('/')` ou `revalidateTag(...)` à appeler
depuis une route API. À implémenter :

1. Route `/api/revalidate` dans la vitrine, protégée par `VITRINE_REVALIDATE_SECRET`
2. Appel depuis l'admin (sur `mutation upsertVitrinePage`) :
   `POST https://sksr.re/api/revalidate?secret=...&path=/`
3. Pas besoin de rebuild complet

## Pourquoi le script de déploiement le fait déjà

`clubflow-deploy.sh` Phase 5 contient :

```bash
cd /home/clubflow/clubflow/apps/vitrine
rm -rf .next/cache .next
npm run build
```

Donc tout déploiement régulier flush déjà le cache. Le problème
n'apparaît que si on insère des pages **entre 2 deploys** sans
rebuild manuel.

## Lié

- [runbooks/seed-vitrine-pages.md](../../runbooks/seed-vitrine-pages.md)
- [runbooks/deploy.md](../../runbooks/deploy.md) Phase 5
