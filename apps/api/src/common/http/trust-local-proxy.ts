import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * Caddy reçoit chaque visiteur et relaie vers `localhost:3000`, en prod comme
 * sur staging. Sans confiance au proxy local, Express donne 127.0.0.1 comme
 * adresse de TOUTES les requêtes : le throttler, qui compte par `req.ip`,
 * tenait alors un seul compteur pour toute la plateforme. La 21ᵉ connexion
 * d'une minute échouait pour tout le monde, tous clubs confondus, et vingt
 * requêtes suffisaient à bloquer toutes les connexions.
 *
 * `loopback` ne croit que 127.0.0.1 et ::1 : l'adresse retenue est la
 * dernière de `X-Forwarded-For` qui ne vient pas de là, celle que Caddy a vue.
 * Une adresse inventée par le client, placée avant, ne change rien.
 */
export function trustLocalReverseProxy(app: NestExpressApplication): void {
  app.set('trust proxy', 'loopback');
}
