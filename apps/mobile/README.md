# ClubFlow — application mobile (Expo)

Client **React Native / Expo** pour les membres : même API GraphQL que le portail web (`apps/member-portal`).

## Prérequis

- API Nest démarrée (`apps/api`, port **3000** par défaut) avec base à jour.
- Docker : `docker compose up -d db` depuis la racine du dépôt (voir le skill `restart-clubflow`).

## Configuration

1. Copier `.env.example` vers `.env` à la racine de ce dossier.
2. Ajuster `EXPO_PUBLIC_GRAPHQL_HTTP` :
   - **Émulateur Android** : `http://10.0.2.2:3000/graphql` (accès à l’hôte).
   - **Simulateur iOS** ou **Expo web** : `http://localhost:3000/graphql`.
   - **Téléphone sur le même Wi‑Fi** : URL avec l’**IP locale** de la machine (ex. `http://192.168.1.10:3000/graphql`).

## Lancer l’app

```powershell
Set-Location C:\Users\flore\ClubFlow\apps\mobile
npm install
npx expo start
```

Puis ouvrir dans **Expo Go** (QR code) ou lancer un émulateur (`a` / `i` dans le terminal Expo).

## Authentification et API

- En-têtes alignés sur le portail : `Authorization: Bearer …`, `x-club-id`, plus `x-clubflow-client: mobile`.
- Stockage local : mêmes clés AsyncStorage que le `localStorage` du portail (`clubflow_member_*`).
- Comptes de test : voir `apps/member-portal/README.md` (ex. `admin@clubflow.local` après seed).

## CORS

En développement, l’API autorise les requêtes **sans** en-tête `Origin` (clients natifs). En production, utiliser `CORS_ALLOW_NO_ORIGIN=true` dans `apps/api/.env` si nécessaire — voir `apps/api/.env.example`.
