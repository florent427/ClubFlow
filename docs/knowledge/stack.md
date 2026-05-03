# Stack technique ClubFlow

> Versions tranchées. Toute modif = ADR (cf. docs/memory/decisions/).

## Vue d'ensemble

ClubFlow = SaaS multi-tenant de gestion de club sportif/associatif.
Multi-clubs, multi-rôles, RGPD, hébergé en France/EU.

## Couches

| Couche | Tech | Version | Notes |
|---|---|---|---|
| Backend API | NestJS + GraphQL (Apollo Server v5) | 11.x | TypeScript strict, Prisma client, Socket.IO `/chat` |
| ORM | Prisma | 6.x | PostgreSQL connector, code-first migrations |
| Database | PostgreSQL | **16** | Pas 15, pas 17 — cf ADR-0001. Tuning 8 GB hardcodé pour prod |
| Cache/Queue (optionnel) | Redis | 7.x | Sessions Apollo, throttling |
| Admin web | React + Vite + Apollo Client v4 | — | Port dev 5173 |
| Member portal web | React + Vite + Apollo Client v4 | — | Port dev 5174 |
| Mobile membre | Expo SDK 55 + RN 0.83 | — | Apollo, socket.io-client |
| Mobile admin | Expo SDK 55 + RN 0.83 | — | (en cours), package partagé `@clubflow/mobile-shared` |
| Vitrine publique | Next.js 15 (App Router, SSR) | — | Port dev 5175, prod 5175 hardcodé |
| Auth | JWT + refresh tokens | — | Bearer + `X-Club-Id` header |
| Mail dev | Mailpit (Docker) | — | UI sur 8025, SMTP 1025 |
| Mail prod | **Brevo** (ex-Sendinblue) | — | Multi-domain, plan gratuit 300 mails/jour |
| OCR | OpenRouter (Claude Sonnet 4.5 vision) | — | Pipeline 3-call, sharp + pdf-parse v1.1.1 + pdf-to-img v4 |

## Modules livrés (v0.2.0)

Members, Families, Adhésions/Cart, Billing, Accounting, Comms (Email/Push/Messaging interne),
Messaging WS, Planning, Events, Projects, Booking, Shop, Sponsoring, Subsidies, Vitrine
site public, Blog, Settings, Agent IA (Aïko), System Admin.

## Décisions piège (à NE PAS toucher sans réfléchir)

Toutes documentées en ADR :
- `pdf-parse v1.1.1` épinglé (cf. pitfalls/pdf-parse-v2-conflict.md)
- `pdf-to-img v4` chargé via `new Function('s', 'return import(s)')` (ESM-only sur tsconfig CJS)
- Sharp prebuilds OK ARM64 et x86_64
- `isBank` par RÔLE débit/crédit, jamais par code compte (commit `3480fbc`)
- Apollo `refetchQueries` by name systématique sur les mutations
- `DATABASE_URL` au format Prisma : `postgresql://user:pwd@host:5432/db`

## Conception détaillée

`ClubFlow_Conception_Provisoire.md` (43 KB) — design doc complet à la racine du repo.
