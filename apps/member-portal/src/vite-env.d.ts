/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GRAPHQL_HTTP: string;
  /** URL de base de l’app administration (ex. http://localhost:5173/ ou /admin). */
  readonly VITE_ADMIN_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
