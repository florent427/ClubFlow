import 'server-only';

/**
 * Client GraphQL minimal côté serveur (fetch natif) pour l'App Router.
 *
 * Pourquoi pas Apollo Client ici : les pages vitrine sont en SSR pur (pas
 * d'interaction client sur les queries de contenu). Un simple wrapper fetch
 * est plus léger, cacheable par Next.js, et évite les complexités SSR Apollo.
 *
 * Côté client (mode édition uniquement), on utilisera Apollo pour les
 * mutations interactives (voir apps/vitrine/src/lib/apollo-edit-client.ts).
 */
export interface GraphQLResult<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

export interface FetchGraphQLOptions {
  revalidate?: number | false; // secondes, ou false pour dynamic
  tags?: string[];
  cookie?: string;
  authJwt?: string;
}

function apiUrl(): string {
  const url = process.env.VITRINE_API_URL;
  if (!url) {
    throw new Error('VITRINE_API_URL manquant dans l’env');
  }
  return url;
}

export async function fetchGraphQL<T>(
  query: string,
  variables: Record<string, unknown> = {},
  options: FetchGraphQLOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (options.cookie) headers['Cookie'] = options.cookie;
  if (options.authJwt) headers['Authorization'] = `Bearer ${options.authJwt}`;

  const res = await fetch(apiUrl(), {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
    next: {
      // revalidate=false ⇒ pas de cache (dynamic). Default 60s.
      revalidate:
        options.revalidate === false
          ? 0
          : (options.revalidate ?? 60),
      tags: options.tags,
    },
  });

  if (!res.ok) {
    throw new Error(`GraphQL HTTP ${res.status}`);
  }
  const json = (await res.json()) as GraphQLResult<T>;
  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors.map((e) => e.message).join(' · '));
  }
  if (!json.data) {
    throw new Error('Réponse GraphQL sans data');
  }
  return json.data;
}
