import type { EditContext } from '@/lib/edit-context';

/**
 * Décode le payload JWT sans vérifier la signature — l'API vérifie à chaque
 * mutation. Le but ici est juste d'extraire `clubId` pour le header X-Club-Id.
 */
export function extractClubIdFromJwt(jwt: string): string | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      atob(parts[1]!.replace(/-/g, '+').replace(/_/g, '/')),
    ) as { clubId?: string };
    return payload.clubId ?? null;
  } catch {
    return null;
  }
}

type EditOn = Extract<EditContext, { editMode: true }>;

export interface GraphQLRunner {
  <T>(query: string, variables: Record<string, unknown>): Promise<T>;
}

/**
 * Retourne un helper GraphQL pré-configuré pour l'édition admin.
 *
 *  - URL : depuis `edit.apiUrl`
 *  - Authorization: Bearer <edit JWT>
 *  - X-Club-Id : extrait du JWT
 *
 * Les erreurs GraphQL sont remontées en exception.
 */
export function makeEditRunner(edit: EditOn): GraphQLRunner {
  return async function run<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    const res = await fetch(edit.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${edit.editJwt}`,
        'X-Club-Id': extractClubIdFromJwt(edit.editJwt) ?? '',
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as {
      errors?: Array<{ message: string }>;
      data: T;
    };
    if (json.errors && json.errors.length > 0) {
      throw new Error(json.errors.map((e) => e.message).join(' · '));
    }
    return json.data;
  };
}
