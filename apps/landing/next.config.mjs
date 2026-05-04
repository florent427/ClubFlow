/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    LANDING_API_URL:
      process.env.LANDING_API_URL ?? 'http://localhost:3000/graphql',
    LANDING_ADMIN_URL:
      process.env.LANDING_ADMIN_URL ?? 'http://localhost:5173',
    LANDING_VITRINE_BASE:
      process.env.LANDING_VITRINE_BASE ?? 'clubflow.topdigital.re',
  },
};

export default nextConfig;
