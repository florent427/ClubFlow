import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const hdrs = await headers();
  const host = hdrs.get('host') ?? 'localhost:5175';
  const proto =
    process.env.NODE_ENV === 'production'
      ? 'https'
      : hdrs.get('x-forwarded-proto') ?? 'http';
  const baseUrl = `${proto}://${host}`;

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/__auth'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
