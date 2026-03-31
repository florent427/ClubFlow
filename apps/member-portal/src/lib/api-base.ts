/** Origine API (sans /graphql) pour OAuth HTTP et liens directs. */
export function getApiBaseUrl(): string {
  const gql =
    import.meta.env.VITE_GRAPHQL_HTTP ?? 'http://localhost:3000/graphql';
  return gql.replace(/\/graphql\/?$/, '');
}
