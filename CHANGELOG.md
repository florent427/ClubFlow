# Changelog

Toutes les versions notables de ClubFlow sont documentées dans ce fichier.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le
versioning [Semantic Versioning](https://semver.org/lang/fr/).

Ce fichier est **régénéré automatiquement** par
[release-please](https://github.com/googleapis/release-please) à partir des
commits Conventional Commits sur `main`. Ne pas l'éditer à la main.

## 0.1.0 (2026-05-03)

### ✨ Initial production release

- Stack NestJS + GraphQL + Prisma + PostgreSQL 16
- Front admin (React + Vite) + portail membre + vitrine Next.js
- Mobile membre (Expo SDK 55) + mobile-admin (en cours)
- Module Communication multi-canal (email + messagerie interne + push)
- Module Comptabilité avec OCR par IA (3-call pipeline)
- Module Adhésions, Familles, Billing, Planning, Events, Projects, Booking,
  Shop, Sponsoring, Subsidies, Site vitrine, Blog, Settings, Agent IA Aïko
- Déploiement prod sur Hetzner CX33 (Helsinki) — TLS auto Let's Encrypt
- Backups quotidiens pg_dump → Hetzner Storage Box
- Mail prod via Brevo (multi-domaine)
- Vitrine SKSR live sur sksr.re
