/**
 * Emission de JSON-LD structured data pour SEO avancé.
 * Rendu server-only — aucun JS client.
 */
interface Props {
  data: Record<string, unknown>;
}

export function JsonLd({ data }: Props) {
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data),
      }}
    />
  );
}

export function buildSportsClubLd(args: {
  name: string;
  url: string;
  description?: string;
  address?: string;
  phone?: string;
  email?: string;
  logoUrl?: string | null;
  sameAs?: string[];
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsClub',
    name: args.name,
    url: args.url,
    ...(args.description ? { description: args.description } : {}),
    ...(args.logoUrl ? { logo: args.logoUrl } : {}),
    ...(args.address
      ? {
          address: {
            '@type': 'PostalAddress',
            streetAddress: args.address,
          },
        }
      : {}),
    ...(args.phone
      ? {
          contactPoint: {
            '@type': 'ContactPoint',
            telephone: args.phone,
            email: args.email,
            contactType: 'customer service',
          },
        }
      : {}),
    ...(args.sameAs && args.sameAs.length > 0 ? { sameAs: args.sameAs } : {}),
  };
}

export function buildArticleLd(args: {
  title: string;
  description?: string | null;
  url: string;
  publishedAt: string | null;
  coverImageUrl?: string | null;
  clubName: string;
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: args.title,
    ...(args.description ? { description: args.description } : {}),
    url: args.url,
    ...(args.publishedAt ? { datePublished: args.publishedAt } : {}),
    ...(args.coverImageUrl ? { image: args.coverImageUrl } : {}),
    publisher: {
      '@type': 'SportsClub',
      name: args.clubName,
    },
    author: {
      '@type': 'SportsClub',
      name: args.clubName,
    },
  };
}
