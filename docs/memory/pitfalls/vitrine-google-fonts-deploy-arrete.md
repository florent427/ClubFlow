# Piège — Google Fonts injoignable au build vitrine : la prod reste à moitié déployée

## Symptôme

Le job « Deploy to production » échoue à l'étape `Deploy via SSH`, au
build de la vitrine :

```
TypeError: Cannot read properties of null (reading '1')
    at .../apps/vitrine/node_modules/next/dist/compiled/@next/font/dist/google/loader.js:122:78
    at async nextFontGoogleFontLoader (.../next/dist/compiled/@next/font/dist/google/loader.js:104:33)
> Build failed because of webpack errors
```

Les 4 vhosts répondent toujours 200 juste après : rien ne paraît cassé.

## Contexte

Rencontré le 2026-10-21 en promouvant la v0.80.0 (PR #298). Aucun
commit du lot ne touchait la vitrine. Le serveur ne joignait plus
`fonts.googleapis.com` pendant quelques minutes, puis l'accès est revenu
(`curl` en 200).

`next/font/google` télécharge les polices **au build**, pas à
l'exécution. Une panne réseau passagère vers Google suffit donc à faire
échouer `npm run build`. Le message (`reading '1'` sur `null`) ne parle
ni de réseau ni de police : c'est le loader qui ne trouve pas de réponse
CSS à analyser.

## Cause

`bin/clubflow-deploy.sh` tourne en `set -euo pipefail` et enchaîne les
étapes dans cet ordre :

1. `git reset --hard origin/main`
2. API : `prisma db push` puis `npm run build` (le `dist/` est remplacé)
3. admin : `vite build` (servi en statique par Caddy, donc **en ligne
   tout de suite**)
4. portail : `vite build` (idem)
5. vitrine : `rm -rf .next/cache .next` puis `npm run build` ← échec ici
6. `systemctl restart clubflow-api clubflow-vitrine`

Le script s'arrête à l'étape 5, donc l'étape 6 n'a jamais lieu. La prod
se retrouve dans un état mixte :

- le **schéma** est déjà poussé et le **nouvel admin et le nouveau
  portail** sont servis ;
- l'**API** tourne encore sur l'ancien code en mémoire. Les nouvelles
  pages appellent des requêtes GraphQL qu'elle ne connaît pas ;
- la **vitrine** n'a plus de build : `.next` a été vidé et
  `.next/BUILD_ID` n'existe pas. Le processus en cours sert encore depuis
  la mémoire, mais **le prochain redémarrage de `clubflow-vitrine` la
  fait tomber**.

## Solution

1. Vérifier que le serveur rejoint de nouveau Google Fonts et constater
   l'état de la vitrine :

   ```bash
   "/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 \
     'curl -s -o /dev/null -w "fonts %{http_code}\n" -m 15 "https://fonts.googleapis.com/css2?family=Inter&display=swap";
      ls ~/clubflow/apps/vitrine/.next/BUILD_ID'
   ```

2. Relancer **le même run** (il refait tout le script, `git reset`
   compris) :

   ```bash
   gh run rerun <id> --failed
   ```

3. Contrôler : `.next/BUILD_ID` présent, les 4 vhosts en 200,
   `{ __typename }` sur l'API, et une requête de la nouvelle
   fonctionnalité qui répond `Unauthorized` plutôt que
   `Cannot query field`.

Ne pas oublier ensuite la suite habituelle de la promotion : le tag
n'est pas coupé tout seul (voir
[github-token-ne-retrigger-pas.md](github-token-ne-retrigger-pas.md)).

## Pourquoi NE PAS faire

- ❌ **Chercher un bug dans la vitrine** : le message ressemble à une
  erreur de code alors que c'est le réseau. Si le lot ne touche pas
  `apps/vitrine`, tester d'abord `fonts.googleapis.com` depuis le
  serveur.
- ❌ **Se fier aux 200 des vhosts** pour conclure que « ça a marché » :
  la vitrine sert depuis la mémoire et l'API sur l'ancien code.
- ❌ **Redémarrer `clubflow-vitrine` à la main** pour « remettre
  d'aplomb » : sans `BUILD_ID`, le service ne redémarre pas, et c'est
  justement ce qui met la vitrine par terre.
- ❌ **Laisser la prod dans cet état en attendant le prochain push** :
  admin et portail appellent une API qui n'a pas leurs requêtes.

## Détection

- Run « Deploy to production » en `failure` avec `next/font` dans la
  pile d'erreur.
- Sur le serveur, `apps/vitrine/.next/BUILD_ID` absent.

## Lié

- [runbooks/deploy.md](../../runbooks/deploy.md)
- [runbooks/rollback.md](../../runbooks/rollback.md)
- [workflows/promouvoir-une-branche-partagee.md](../workflows/promouvoir-une-branche-partagee.md)
- [github-token-ne-retrigger-pas.md](github-token-ne-retrigger-pas.md)
