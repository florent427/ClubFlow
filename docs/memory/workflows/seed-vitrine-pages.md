# Workflow — Seeder le contenu vitrine d'un club

> Vue d'ensemble du parcours de création de contenu pour la vitrine d'un
> club. Pour la procédure technique pure (insertion + flush cache), voir
> [runbooks/seed-vitrine-pages.md](../../runbooks/seed-vitrine-pages.md).

## Quand l'utiliser

- Onboarding d'un nouveau club (cf. `creation-club-multi-tenant.md`)
- Refonte du site vitrine d'un club existant
- Migration de contenu depuis une ancienne vitrine

## Phase 1 — Préparer le contenu (offline)

Récupérer du client :
- Textes (markdown ou doc Word) pour chaque page
- Images (logos, bannières, photos d'illustration) en haute déf
- Liens externes (réseaux sociaux, partenaires)
- Mentions légales (souvent oubliées par le client → leur fournir un
  template à compléter)

Stocker dans un dossier local :

```
~/clubX-content/
├── pages/
│   ├── accueil.md
│   ├── stages.md
│   ├── tarifs.md
│   └── contact.md
├── images/
│   ├── logo.svg
│   └── banniere-accueil.jpg
└── articles/
    ├── 2026-04-ouverture-saison.md
    └── 2026-05-stage-pacques.md
```

## Phase 2 — Créer les pages depuis l'admin web

Connecté à https://clubflow.topdigital.re comme admin du club :

1. **Vitrine → Pages → Nouvelle page**
2. Pour chaque page :
   - Slug (vide pour `/`, `stages` pour `/stages`, etc.)
   - Title (H1 + balise meta `<title>`)
   - Meta description (160 chars max, important pour SEO)
   - Sections (chaque section = un bloc visuel : hero, texte, gallery, CTA, formulaire)
   - Status : `DRAFT` puis `PUBLISHED` quand prêt

3. **Réordonner les sections** par drag & drop si l'admin le supporte

## Phase 3 — Charger les médias

1. **Vitrine → Médias → Upload**
2. Logos en SVG si possible (sinon PNG transparent 512×512)
3. Bannières en JPG haute qualité (1920×1080 ou 2560×1440)
4. Articles : 1 image par article (1200×630 pour preview Open Graph)

## Phase 4 — Charte graphique

1. **Vitrine → Charte**
2. Couleurs primaires/secondaires (codes hex)
3. Police titres / corps (limiter à 1-2 polices Google Fonts max)
4. Favicon (uploadé, généré auto en plusieurs tailles)

## Phase 5 — Articles de blog

1. **Vitrine → Articles → Nouvel article**
2. Pour chaque article :
   - Title + slug
   - Excerpt (résumé 150 chars)
   - Image hero
   - Contenu (markdown ou WYSIWYG)
   - Categories / tags
   - Date publication
   - Status `PUBLISHED`

## Phase 6 — Flush cache Next.js (CRITIQUE)

⚠️ Sans cette étape, les nouvelles pages restent en 404 jusqu'au prochain
deploy. Cf. [pitfalls/nextjs-isr-cache-stale.md](../pitfalls/nextjs-isr-cache-stale.md).

```bash
ssh-into-prod "
  cd /home/clubflow/clubflow/apps/vitrine
  rm -rf .next/cache .next
  npm run build
  sudo systemctl restart clubflow-vitrine
"
```

## Phase 7 — QA

```bash
# Smoke
for path in '/' '/stages' '/tarifs' '/contact' '/blog'; do
  echo "$(curl -s -o /dev/null -w '%{http_code}' https://clubX.fr$path) $path"
done
```

Visite manuelle :
- Toutes les pages se chargent (200)
- Logos + images apparaissent
- Liens internes ne sont pas cassés (vers `/contact`, `/stages`, etc.)
- Formulaire contact envoie un mail (vérifier dans Brevo dashboard ou
  inbox admin)
- Articles de blog accessibles depuis `/blog`
- Mobile responsive OK

## Phase 8 — SEO basique

- Vérifier que chaque page a un `<title>` et une meta description
- Sitemap `/sitemap.xml` est généré (Next.js le fait auto si configuré)
- robots.txt autorise tout (`User-agent: * / Allow: /`)
- Soumettre la sitemap à Google Search Console (à faire 1x par club)

## Migration depuis local vers prod

Si tu as déjà créé tout le contenu en local (port 5175) et que tu veux
le pousser en prod :

Cf. [runbooks/seed-vitrine-pages.md](../../runbooks/seed-vitrine-pages.md)
§"Migrer le contenu depuis local vers prod" — utilise `pg_dump -t` puis
`pg_restore -a` sur les tables vitrine spécifiques.

## Lié

- [runbooks/seed-vitrine-pages.md](../../runbooks/seed-vitrine-pages.md)
- [pitfalls/nextjs-isr-cache-stale.md](../pitfalls/nextjs-isr-cache-stale.md)
- [workflows/creation-club-multi-tenant.md](creation-club-multi-tenant.md)
