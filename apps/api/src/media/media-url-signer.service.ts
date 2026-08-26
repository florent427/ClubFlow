import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable } from '@nestjs/common';

/**
 * URLs média signées — lecture temporaire d'un asset PRIVÉ sans en-tête.
 *
 * POURQUOI CE MÉCANISME EXISTE
 *
 * Une photo de profil d'adhérent est rangée dans `Member.photoUrl`, une
 * colonne de TEXTE : aucune clé étrangère ne la relie à la fiche, donc le
 * contrôle de lecture ne peut pas déduire qu'elle est légitime, et l'asset
 * reste PRIVATE. Une balise `<img src>` n'envoie ni `Authorization` ni
 * `X-Club-Id` : même l'administrateur connecté récupérait un 404, et la
 * photo n'était visible par personne.
 *
 * Les deux issues évidentes étaient mauvaises :
 *   - rendre ces assets PUBLIC, c'est-à-dire ramener la protection du
 *     visage d'un adhérent — mineur pour une partie d'entre eux — à la
 *     non-devinabilité d'un UUID. C'est la « sécurité par obscurité » que
 *     ce module refuse déjà ailleurs ;
 *   - servir chaque avatar par `fetch` authentifié + blob URL, soit une
 *     refonte de ~90 points d'affichage sur trois applications.
 *
 * D'où la signature : l'URL porte elle-même son droit de lecture, borné
 * dans le temps. Elle est FRAPPÉE À LA LECTURE, par un chemin GraphQL déjà
 * authentifié et déjà scopé au club — jamais stockée en base. Ce qui est
 * persisté reste l'URL canonique ; la fuite éventuelle d'une URL signée
 * expire d'elle-même.
 *
 * CLÉ — dérivée de `JWT_SECRET` par HMAC avec une étiquette de domaine,
 * pour deux raisons : aucune variable d'environnement à ajouter au
 * déploiement, et la clé de signature d'URL n'est pas le secret des jetons
 * (compromettre l'une ne donne pas l'autre).
 */
/** Reconnaît une URL servie par notre endpoint média, et en extrait l'id. */
const MEDIA_PATH = /\/media\/([0-9a-fA-F-]{36})(?:$|[?#])/;

/**
 * Retire `exp`/`sig` d'une URL avant persistance.
 *
 * LE PIÈGE QUE CECI DÉSAMORCE : un client lit `photoUrl` (donc signée), la
 * garde dans l'état d'un formulaire, et la renvoie telle quelle au prochain
 * « Enregistrer ». On persisterait alors une URL périssable — la photo
 * remarcherait une heure puis casserait DÉFINITIVEMENT, et le stock de
 * photos se dégraderait sans que rien ne le signale.
 *
 * Le nettoyage est fait CÔTÉ SERVEUR, à l'écriture, et non dans chaque
 * formulaire : trois applications écrivent ce champ, et un client mobile
 * déjà publié ne se corrige pas.
 *
 * Fonction pure et sans secret : elle n'a besoin d'aucune injection, donc
 * les services d'écriture l'importent directement.
 */
export function stripMediaSignature(
  url: string | null | undefined,
): string | null {
  if (!url) return url ?? null;
  if (!MEDIA_PATH.test(url)) return url;
  const [base, query] = url.split('?');
  if (!query) return url;
  const restants = query.split('&').filter((p) => !/^(exp|sig)=/.test(p));
  return restants.length ? `${base}?${restants.join('&')}` : base;
}

@Injectable()
export class MediaUrlSignerService {
  /**
   * Durée de validité. Assez longue pour qu'une page ouverte un moment ne
   * voie pas ses avatars tomber, assez courte pour qu'une URL recopiée
   * hors contexte cesse vite de fonctionner.
   */
  static readonly TTL_SECONDS = 3600;

  private key(): Buffer {
    const secret = process.env.JWT_SECRET ?? 'change-me-in-development';
    return createHmac('sha256', secret).update('media-url-signing').digest();
  }

  private digest(assetId: string, exp: number): string {
    return createHmac('sha256', this.key())
      .update(`${assetId}.${exp}`)
      .digest('base64url');
  }

  /** Signature + expiration pour un asset donné. */
  sign(assetId: string, now = Date.now()): { exp: number; sig: string } {
    const exp =
      Math.floor(now / 1000) + MediaUrlSignerService.TTL_SECONDS;
    return { exp, sig: this.digest(assetId, exp) };
  }

  /**
   * Vérifie une signature. Faux sur expiration, sur signature invalide, et
   * sur `exp` non numérique.
   *
   * La comparaison est à temps constant : un `===` sur une signature laisse
   * fuiter, octet par octet, de quoi la forger.
   */
  verify(
    assetId: string,
    exp: string | undefined,
    sig: string | undefined,
    now = Date.now(),
  ): boolean {
    if (!exp || !sig) return false;
    const expNum = Number(exp);
    if (!Number.isInteger(expNum)) return false;
    if (expNum * 1000 <= now) return false;

    const attendu = Buffer.from(this.digest(assetId, expNum));
    const fourni = Buffer.from(sig);
    if (attendu.length !== fourni.length) return false;
    return timingSafeEqual(attendu, fourni);
  }

  /**
   * Signe une URL média. Rend la valeur INCHANGÉE si ce n'est pas une URL
   * de notre endpoint — data URI base64 (ancien chemin de la photo
   * recadrée dans l'admin), URL externe, chaîne vide. Signer aveuglément
   * casserait ces cas, qui fonctionnent aujourd'hui.
   */
  signUrl(url: string | null | undefined, now = Date.now()): string | null {
    if (!url) return url ?? null;
    const m = MEDIA_PATH.exec(url);
    if (!m) return url;
    const assetId = m[1];
    const { exp, sig } = this.sign(assetId, now);
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}exp=${exp}&sig=${sig}`;
  }
}
