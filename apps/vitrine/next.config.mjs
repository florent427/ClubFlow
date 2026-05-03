/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Le site vitrine sert aussi les médias uploadés côté API : on whitelist
  // l'API locale pour <Image> côté Next. En prod on ajoutera le domaine public.
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3000',
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
