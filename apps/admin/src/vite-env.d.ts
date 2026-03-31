/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GRAPHQL_HTTP?: string;
  readonly VITE_DEV_CLUB_ID?: string;
  /** URL du portail membre pour le bouton Personnel (ex. http://localhost:5174/ ou /membre). */
  readonly VITE_MEMBER_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
