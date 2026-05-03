import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { resolveCurrentClub } from '@/lib/club-resolution';
import { fetchArticles } from '@/lib/page-fetchers';

const STATIC_PAGES = [
  '/',
  '/club',
  '/cours',
  '/dojo',
  '/tarifs',
  '/equipe',
  '/galerie',
  '/actualites',
  '/blog',
  '/competitions',
  '/contact',
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const hdrs = await headers();
  const host = hdrs.get('host') ?? 'localhost:5175';
  const proto =
    process.env.NODE_ENV === 'production'
      ? 'https'
      : hdrs.get('x-forwarded-proto') ?? 'http';
  const baseUrl = `${proto}://${host}`;

  const now = new Date();
  const statics: MetadataRoute.Sitemap = STATIC_PAGES.map((p) => ({
    url: `${baseUrl}${p}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: p === '/' ? 1.0 : 0.7,
  }));

  try {
    const club = await resolveCurrentClub();
    const articles = await fetchArticles(club.slug, 100);
    const articleEntries: MetadataRoute.Sitemap = articles.map((a) => ({
      url: `${baseUrl}/blog/${a.slug}`,
      lastModified: a.publishedAt ? new Date(a.publishedAt) : now,
      changeFrequency: 'monthly',
      priority: 0.6,
    }));
    return [...statics, ...articleEntries];
  } catch {
    return statics;
  }
}
