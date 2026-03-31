# ClubFlow — Portail membre (MVP)

Application Vite + React pour l’espace membre (login, choix de profil, tableau de bord, planning, foyer).

## Développement local

1. Démarrer l’API (`apps/api`, port par défaut **3000**) avec une base à jour.
2. Variables d’environnement (fichier `.env` à la racine de ce dossier) :
   - `VITE_GRAPHQL_HTTP` — URL du endpoint GraphQL (ex. `http://localhost:3000/graphql`). Si absent, cette valeur est utilisée par défaut.
   - `VITE_ADMIN_APP_URL` — URL de base du **back-office** pour le bouton **Admin** (utilisateurs avec rôle club admin/bureau/trésorerie). En dev deux ports : `http://localhost:5173/`. En prod **même origine** : ex. `/admin`.
3. `npm install` puis `npm run dev` — l’app écoute en général sur **http://localhost:5174** (voir la sortie Vite).

### Bascule vers l’admin

Le portail copie le JWT dans les clés **`clubflow_admin_*`** puis ouvre `VITE_ADMIN_APP_URL`. Sans **même origine** en local, renseignez une URL absolue (voir aussi `apps/admin/README.md`).

En développement, l’API accepte les origines `http://localhost:*` et `http://127.0.0.1:*` (CORS avec cookies/credentials). Pour la production, configurez les origines explicites côté API.

## Comptes de test

Après `npm run db:seed` dans `apps/api`, le compte **`admin@clubflow.local`** a aussi une **fiche membre** liée (`Member.userId`) : vous pouvez l’utiliser sur le portail (**`viewerProfiles`** non vide). Mot de passe : `SEED_ADMIN_PASSWORD` ou `ChangeMe!` par défaut.

Pour tout autre compte : il faut un enregistrement **`User`** avec mot de passe **et** au moins un **`Member`** du club dont **`userId`** pointe vers ce user — sinon le portail affiche « Aucun profil membre lié ».
