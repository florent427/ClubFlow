# Site vitrine — runbook

## Architecture

4 apps, monorepo npm :

| App | Port dev | Rôle |
|---|---|---|
| `api` | 3000 | NestJS + GraphQL + Prisma, source de vérité |
| `admin` | 5173 | Back-office (Vite + React) |
| `member-portal` | 5174 | Portail membre |
| `vitrine` | 5175 | Site public Next.js (SSR/ISR) |

## Lancer en dev

```bash
# Depuis la racine du worktree
docker compose up -d db
cd apps/api && npm run start:dev        # port 3000
cd apps/admin && npm run dev            # port 5173
cd apps/member-portal && npm run dev    # port 5174
cd apps/vitrine && npm run dev          # port 5175
```

## Seeds

```bash
cd apps/api
# Seed principal (club démo, admin, membres)
DATABASE_URL=... npx tsx prisma/seed.ts

# Seed des 10 pages vitrine (depuis HTML SKSR)
DATABASE_URL=... npx tsx prisma/seed-vitrine.ts demo-club

# Import des assets image SKSR (logo, dojo, senseis)
DATABASE_URL=... \
SKSR_ASSETS_DIR=/path/to/site_sksr_or/assets \
API_PUBLIC_URL=http://localhost:3000 \
  npx tsx prisma/seed-vitrine-assets.ts demo-club
```

## Variables d'environnement clés

### `apps/api/.env`

```env
DATABASE_URL=postgresql://clubflow:clubflow@localhost:5432/clubflow
JWT_SECRET=change-me
PORT=3000

# Site vitrine
VITRINE_REVALIDATE_URL=http://localhost:5175/api/revalidate
VITRINE_REVALIDATE_SECRET=dev-revalidate-secret  # idem que vitrine/.env.local
VITRINE_PUBLIC_URL=http://localhost:5175
```

### `apps/vitrine/.env.local`

```env
VITRINE_API_URL=http://localhost:3000/graphql
VITRINE_DEFAULT_CLUB_SLUG=demo-club
VITRINE_REVALIDATE_SECRET=dev-revalidate-secret
VITRINE_JWT_SECRET=change-me  # Idem JWT_SECRET de l'API
VITRINE_ADMIN_URL=http://localhost:5173
```

## Flux d'édition admin → vitrine

1. Admin navigue dans `http://localhost:5173/vitrine` et clique « Éditer en ligne ↗ »
   sur une page.
2. L'admin appelle `mutation issueVitrineEditToken` → JWT court (30 min).
3. Ouverture nouvelle fenêtre `http://localhost:5175/api/edit/enter?token=…&redirect=/cours`.
4. Next.js pose un cookie `clubflow_vitrine_edit` httpOnly et redirige vers `/cours`.
5. `VitrinePageShell` détecte le cookie côté serveur → active l'edit mode.
6. Chaque `EditableText`/`EditableList`/`EditableImage` envoie ses mutations à l'API
   avec `Authorization: Bearer <edit-jwt>`.
7. Chaque mutation API déclenche `VitrineIsrService.revalidate` → webhook Next.js
   → ISR revalide la page (ou le tag concerné).

## Composants éditables

### Blocks câblés pour édition inline

Les blocks suivants supportent `EditableText` / `EditableList` / `EditableImage` :

- `HeroSection` (titre, sous-titre, kanji, CTA, metaItems, image de fond)
- `PageHero` (titre, sous-titre, kanji, label)
- `ManifestoSection` (kanji, titre, paragraphes, citation, attribution)
- `CardsGridSection` (en-tête + cards — liste)
- `TimelineSection` (en-tête + items — liste)
- `StatsSection` (items — liste)
- `TwoColumnSection` (en-tête, paragraphes — liste, image)
- `RichTextSection` (en-tête, paragraphes — liste, items — liste)
- `PlanningSection` (en-tête + slots — liste)
- `CTABandSection` (titre, sous-titre, kanji, CTA)
- `ContactSection` (en-tête + infoCards — liste)
- `GallerySection` (en-tête ; photos gérées depuis `/vitrine/galerie`)
- `FeaturedArticlesSection` (en-tête ; articles depuis le CRUD)
- `AnnouncementsSection` (en-tête ; annonces depuis le CRUD)

### API array patches

Pour les listes (items d'un block), 4 mutations dédiées :

- `updateSectionListItem(pageId, sectionId, listField, index, patchJson)`
- `addSectionListItem(pageId, sectionId, listField, itemJson, atIndex?)`
- `removeSectionListItem(pageId, sectionId, listField, index)`
- `reorderSectionListItems(pageId, sectionId, listField, newOrder[])`

Chacune crée une révision et déclenche l'invalidation ISR de la page.

## Branding

Page admin : `/vitrine/branding`.

- `kanjiTagline` : string courte sous le nom du club (nav + footer)
- `footerJson` : JSON structuré du footer ; si null, fallback hardcodé SKSR

## Médias

Page admin : `/vitrine/medias`.

- REST : `POST /media/upload?kind=image|document` (JWT + X-Club-Id)
- `GET /media/:id` : public (servi avec cache long)
- Sharp resize auto (images raster) vers max 2000×2000 + conversion WebP
  (SVG et GIF conservés tels quels)

## SEO

- `/sitemap.xml` : toutes les pages + articles publiés
- `/robots.txt`
- `<JsonLd>` : `SportsClub` émis dans le layout global, `Article` dans les pages
  article — structuré schema.org.
- `generateMetadata` par page (lit `VitrinePage.seoTitle` / `seoDescription` / `seoOgImageUrl`)

## Dépannage

### L'édition inline ne sauvegarde pas

1. Vérifier que le cookie `clubflow_vitrine_edit` est présent côté vitrine
   (DevTools → Application → Cookies).
2. Vérifier que le JWT est valide : doit avoir `clubId` et `kind='vitrine-edit'`.
3. Tester la mutation directement via GraphQL Playground avec le token.

### Les modifications ne sont pas visibles côté vitrine

1. `VITRINE_REVALIDATE_SECRET` manquant ou différent entre API et vitrine :
   l'API log un warning « VITRINE_REVALIDATE_SECRET non configuré — ISR skip ».
2. En fallback, le cache ISR expire à 60s par défaut.

### Upload image qui échoue

- Taille max : 10 Mo
- MIME acceptés : PNG, JPEG, WebP, GIF, SVG
- Vérifier les permissions d'écriture sur `UPLOADS_DIR` (défaut `./uploads`).
