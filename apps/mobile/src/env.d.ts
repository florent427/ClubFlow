declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_GRAPHQL_HTTP?: string;
    /** URL de l’admin Vite (ouverture navigateur, pas de SSO JWT). */
    EXPO_PUBLIC_ADMIN_APP_URL?: string;
  }
}
