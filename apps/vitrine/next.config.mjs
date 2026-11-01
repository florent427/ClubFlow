/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Les médias uploadés sont servis par l'API : l'optimiseur `/_next/image`
  // (utilisé par `MediaImg`) ne les accepte que depuis ces hôtes. Garder en
  // phase avec `OPTIMIZABLE_HOSTS` dans `src/lib/media-url.ts`.
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3000',
        pathname: '/media/**',
      },
      {
        protocol: 'https',
        hostname: 'api.clubflow.topdigital.re',
        pathname: '/media/**',
      },
      {
        protocol: 'https',
        hostname: 'staging.api.clubflow.topdigital.re',
        pathname: '/media/**',
      },
    ],
  },
  // Expose explicit vars at build/runtime for the server SSR and the client.
  env: {
    VITRINE_DEFAULT_CLUB_SLUG:
      process.env.VITRINE_DEFAULT_CLUB_SLUG ?? 'demo-club',
  },
};

export default nextConfig;
