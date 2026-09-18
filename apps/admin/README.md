# ClubFlow — Back-office admin

Application Vite + React du back-office club.

## Développement local

- Démarrer l’API (`apps/api`, port **3000** par défaut).
- Fichier `.env` à la racine de ce dossier :
  - `VITE_GRAPHQL_HTTP` — endpoint GraphQL (ex. `http://localhost:3000/graphql`).
  - `VITE_DEV_CLUB_ID` — UUID du club (affiché après `npm run db:seed` dans l’API).
  - `VITE_MEMBER_APP_URL` — URL de base du **portail membre** pour le bouton **Personnel** (bascule sans re-login). Optionnelle : en dev, `http://localhost:5174/` ; en prod, l’URL est déduite de l’hôte (`app.X` → `portail.X`, préfixe d’environnement gardé). À renseigner seulement si le portail est ailleurs (même origine sous `/membre`, autre domaine).
- `npm install` puis `npm run dev` — souvent **http://localhost:5173**.

## Bascule Admin ↔ Portail membre

Les deux apps utilisent des **clés `localStorage` différentes**. Au clic, la session part par **deux canaux** : le `localStorage` local (utile en même origine) et le **fragment d’URL** `#sso=<jeton>&club=<club>`, seul canal qui traverse deux origines (`app.X` ↔ `portail.X`). L’app d’arrivée lit le fragment au démarrage, le stocke, puis nettoie l’URL. Le fragment n’est jamais envoyé au serveur : le jeton ne passe pas dans les journaux.

L’URL de destination vient de `VITE_MEMBER_APP_URL` (côté portail `VITE_ADMIN_APP_URL`) ; sans elle, elle est déduite de l’hôte courant.

---

# React + TypeScript + Vite (gabarit)

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
