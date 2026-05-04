/**
 * Mini-client GraphQL pour la landing — pas d'Apollo, juste un fetch direct.
 * On ne charge pas une dépendance lourde pour 1 mutation.
 */

const PUBLIC_API_URL =
  process.env.NEXT_PUBLIC_LANDING_API_URL ??
  process.env.LANDING_API_URL ??
  'http://localhost:3000/graphql';

export type GraphQLError = {
  message: string;
  extensions?: { code?: string; [k: string]: unknown };
};

export async function gqlRequest<TResult, TVariables = Record<string, unknown>>(
  query: string,
  variables?: TVariables,
): Promise<{ data?: TResult; errors?: GraphQLError[] }> {
  const res = await fetch(PUBLIC_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    return {
      errors: [{ message: `HTTP ${res.status} ${res.statusText}` }],
    };
  }
  return res.json();
}

export const CREATE_CLUB_AND_ADMIN_MUTATION = /* GraphQL */ `
  mutation CreateClubAndAdmin($input: CreateClubAndAdminInput!) {
    createClubAndAdmin(input: $input) {
      ok
      clubId
      clubSlug
      vitrineFallbackUrl
      emailSent
    }
  }
`;

export type CreateClubAndAdminInput = {
  clubName: string;
  clubSlug?: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  /** Token hCaptcha — requis si HCAPTCHA_SECRET configuré côté API. */
  captchaToken?: string;
};

export type CreateClubAndAdminResult = {
  ok: boolean;
  clubId: string;
  clubSlug: string;
  vitrineFallbackUrl: string;
  emailSent: boolean;
};
