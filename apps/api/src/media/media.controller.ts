import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import sharp from 'sharp';
import { MediaAssetsService } from './media-assets.service';
import { MediaUrlSignerService } from './media-url-signer.service';

/**
 * Endpoints REST pour le service média générique.
 *
 *  - POST   /media/upload       (auth admin) upload image ou document
 *  - GET    /media/:id          (mixte)      servir le fichier
 *  - POST   /media/:id/public   (auth admin) rendre public un asset existant
 *
 * `GET /media/:id` accepte aussi une URL SIGNÉE (`?exp=&sig=`) : elle vaut
 * droit de lecture temporaire sur un asset privé, pour les surfaces
 * affichées par `<img src>` qui ne peuvent porter aucun en-tête — photos de
 * profil d'adhérent en tête. Cf. `MediaUrlSignerService`.
 *  - DELETE /media/:id          (auth admin) supprimer
 *  - GET    /media              (auth admin) lister les médias du club
 *
 * Le GET reste ouvert AUX SEULS assets publics — ceux rattachés à une surface
 * publique (vitrine, projets). Tout le reste — justificatifs comptables,
 * documents de subvention, pièces jointes de messagerie, documents signés —
 * exige un JWT valide dont le club correspond au propriétaire du fichier.
 *
 * Ce n'était pas le cas jusqu'au 2026-07-20 : `getPublic` faisait un
 * `findUnique({ where: { id } })` SANS clubId, là où `delete()` filtrait bien
 * sur `{ id, clubId }`. Tout média de tout club était donc lisible sans JWT
 * par quiconque connaissait l'UUID. La seule protection était la
 * non-devinabilité de l'identifiant — de la sécurité par obscurité, qui tombe
 * dès que l'UUID apparaît dans un log de proxy, un `Referer` ou un mail.
 */
@Controller('media')
export class MediaController {
  constructor(
    private readonly service: MediaAssetsService,
    private readonly jwt: JwtService,
    private readonly signer: MediaUrlSignerService,
  ) {}

  private extractClubId(req: Request): string {
    const raw = req.headers['x-club-id'];
    const clubId = Array.isArray(raw) ? raw[0] : raw;
    if (!clubId || typeof clubId !== 'string') {
      throw new BadRequestException('X-Club-Id header requis');
    }
    return clubId;
  }

  @Post('upload')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      // Limite multer à 100 Mo (vidéos / PPTX) ; le service valide ensuite
      // la taille précise en fonction du kind (10 Mo pour IMAGE, 100 Mo pour
      // DOCUMENT / OTHER).
      limits: {
        fileSize: MediaAssetsService.MAX_LARGE_BYTES,
        files: 1,
      },
    }),
  )
  async upload(
    @Req() req: Request,
    @Query('kind') kind: 'image' | 'document' | 'video' | 'audio' | undefined,
    @Query('ownerKind') ownerKind: string | undefined,
    @Query('ownerId') ownerId: string | undefined,
    @Query('visibility') visibility: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    const clubId = this.extractClubId(req);
    if (!file) {
      throw new BadRequestException(
        'Aucun fichier reçu — utilisez le champ multipart `file`.',
      );
    }
    const owner =
      ownerKind && ownerId ? { kind: ownerKind, id: ownerId } : null;
    const userId = (req.user as { userId?: string } | undefined)?.userId ?? null;

    // Détection PPTX : on route vers `uploadPresentationWithPdf` qui tente
    // la conversion LibreOffice pour générer un PDF preview utilisable dans
    // tous les navigateurs (contrairement à Office Online qui exige une
    // URL Internet publique).
    const isPresentation =
      kind === 'document' &&
      new Set([
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.oasis.opendocument.presentation',
      ]).has(file.mimetype);

    if (isPresentation) {
      const { source, pdf } = await this.service.uploadPresentationWithPdf(
        clubId,
        userId,
        file,
        owner,
      );
      return {
        id: source.id,
        clubId: source.clubId,
        kind: source.kind,
        fileName: source.fileName,
        mimeType: source.mimeType,
        sizeBytes: source.sizeBytes,
        publicUrl: source.publicUrl,
        ownerKind: source.ownerKind,
        ownerId: source.ownerId,
        createdAt: source.createdAt.toISOString(),
        // Champs spécifiques présentation : URL PDF de preview si LibreOffice
        // a pu convertir. Le frontend privilégie cette URL (iframe native)
        // et retombe sur Office Online Viewer si null.
        pdfUrl: pdf?.publicUrl ?? null,
        pdfAssetId: pdf?.id ?? null,
      };
    }

    const row =
      kind === 'document'
        ? await this.service.uploadDocument(clubId, userId, file, owner)
        : kind === 'video'
          ? await this.service.uploadVideo(clubId, userId, file, owner)
          : kind === 'audio'
            ? await this.service.uploadAudio(clubId, userId, file, owner)
            : await this.service.uploadImage(clubId, userId, file, owner);
    // Un fichier naît PRIVÉ. Le rendre public est une demande EXPLICITE de
    // l'appelant — logo de club, photo de vitrine, image de produit — donc un
    // geste tracé, et non un défaut subi. Les surfaces rattachées par clé
    // étrangère n'ont pas besoin de le demander : le contrôle de lecture les
    // voit par la relation.
    if (visibility === 'public') {
      await this.service.markPublic(clubId, row.id);
    }

    return {
      id: row.id,
      clubId: row.clubId,
      kind: row.kind,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      publicUrl: row.publicUrl,
      ownerKind: row.ownerKind,
      ownerId: row.ownerId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  async list(
    @Req() req: Request,
    @Query('kind') kind?: 'IMAGE' | 'DOCUMENT' | 'OTHER',
    @Query('ownerKind') ownerKind?: string,
    @Query('ownerId') ownerId?: string,
  ) {
    const clubId = this.extractClubId(req);
    const rows = await this.service.listByClub(clubId, {
      kind,
      ownerKind,
      ownerId,
    });
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      fileName: r.fileName,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      publicUrl: r.publicUrl,
      ownerKind: r.ownerKind,
      ownerId: r.ownerId,
      // Exposé pour que la médiathèque distingue un fichier réellement
      // servable en public d'un fichier qui sortira en 404 chez le visiteur.
      visibility: r.visibility,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * Sert le fichier physique. Public (pas de JWT) : les URLs sont UUID-based
   * non-devinables. Rate-limit raisonnable pour empêcher un scan massif.
   *
   * **CORS ouvert** (`Access-Control-Allow-Origin: *`) : indispensable pour
   * que le viewer PDF.js inline embarqué dans la WebView mobile (chargé
   * via `source={{ html }}` — origin `null`) puisse fetcher le binaire.
   * Aucun risque de fuite de données : les URLs sont UUID-based et
   * non-devinables, et l'endpoint ne renvoie que des binaires (pas de
   * cookies / headers d'auth).
   *
   * **Conversion à la volée** (`?format=png&w=N`) :
   * Le composant React Native `<Image>` ne supporte **pas** SVG. Quand un
   * client mobile demande `/media/<svg-uuid>?format=png`, on rasterise via
   * sharp à la volée et on sert le PNG. Cache long (immutable + ETag) car
   * le résultat est déterministe pour une même paire (assetId, w).
   * Inutile d'ajouter d'autres formats pour l'instant — PNG suffit pour
   * l'usage logo + galerie membre.
   */
  /**
   * Identité du demandeur, ou null s'il est anonyme.
   *
   * Volontairement SANS guard : la route doit rester ouverte pour les
   * `<img src>` de la vitrine, qui ne portent aucun jeton. On vérifie donc le
   * JWT à la main, et seulement pour décider si l'on a le droit de servir un
   * fichier privé.
   *
   * L'en-tête `x-club-id` seul ne prouve RIEN — n'importe qui peut l'envoyer.
   * C'est le jeton signé qui fait foi, et le club demandé doit être l'un de
   * ceux qu'il porte.
   */
  private resolveClubId(req: Request): string | null {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return null;
    try {
      const payload = this.jwt.verify<{ clubIds?: string[]; clubId?: string }>(
        auth.slice(7),
      );
      const claimed = this.extractClubIdOrNull(req);
      if (!claimed) return null;
      const allowed = payload.clubIds ?? (payload.clubId ? [payload.clubId] : []);
      return allowed.includes(claimed) ? claimed : null;
    } catch {
      // Jeton absent, expiré ou falsifié : on retombe en anonyme, donc sur
      // les seuls assets publics. Pas d'erreur — une vitrine ne doit pas
      // casser parce qu'un JWT périmé traîne dans un onglet.
      return null;
    }
  }

  private extractClubIdOrNull(req: Request): string | null {
    const raw = req.headers['x-club-id'];
    const v = Array.isArray(raw) ? raw[0] : raw;
    return typeof v === 'string' && v.length > 0 ? v : null;
  }

  @Get(':id')
  @Throttle({ default: { limit: 1000, ttl: 60_000 } })
  async download(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('format') format: string | undefined,
    @Query('w') widthParam: string | undefined,
    @Query('exp') exp: string | undefined,
    @Query('sig') sig: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    // URL signée : le droit de lecture voyage dans l'URL, parce qu'une
    // balise `<img>` n'envoie aucun en-tête. Cf. MediaUrlSignerService.
    const signed = this.signer.verify(id, exp, sig);
    const { row, stream, isPublic } = await this.service.streamFor(id, {
      clubId: this.resolveClubId(req),
      signed,
    });

    // ─── Branche conversion SVG → PNG ─────────────────────────────
    if (format === 'png' && row.mimeType === 'image/svg+xml') {
      const targetWidth = clampWidth(widthParam);
      try {
        // Buffer le SVG complet (les SVG sont petits, < 1Mo en pratique).
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(chunk as Buffer);
        }
        const svgBuf = Buffer.concat(chunks);
        const pngBuf = await sharp(svgBuf, { density: 192 })
          .resize({ width: targetWidth, withoutEnlargement: false })
          .png()
          .toBuffer();
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Length', String(pngBuf.byteLength));
        applyCachePolicy(res, isPublic, signed ? exp : undefined);
        res.setHeader(
          'ETag',
          `"${this.service.etag(row)}-png-${targetWidth}"`,
        );
        if (isPublic) applyOpenCors(res);
        res.end(pngBuf);
        return;
      } catch {
        // Fallback : si sharp échoue (SVG mal formé, sécurité…), on sert
        // le SVG brut — le client gérera (Image RN affichera blanc, mais
        // ne plante pas).
      }
    }

    // ─── Branche standard (binaire tel quel) ──────────────────────
    res.setHeader('Content-Type', row.mimeType);
    const encoded = encodeURIComponent(row.fileName);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${row.fileName.replace(/"/g, '')}"; filename*=UTF-8''${encoded}`,
    );
    res.setHeader('Content-Length', String(row.sizeBytes));
    applyCachePolicy(res, isPublic, signed ? exp : undefined);
    res.setHeader('ETag', `"${this.service.etag(row)}"`);
    if (isPublic) applyOpenCors(res);
    stream.on('error', () => {
      if (!res.headersSent) res.status(500);
      res.end();
    });
    stream.pipe(res);
  }

  /**
   * Rend public un asset déjà uploadé. Idempotent.
   *
   * Un média naît PRIVÉ et, jusqu'ici, `visibility=public` ne pouvait se
   * demander qu'à l'upload. Or les surfaces rattachées par URL EN TEXTE —
   * sections de page vitrine, logo de club, image produit — peuvent désigner
   * un asset **choisi dans la médiathèque** bien après son upload. Aucune
   * relation ne les voit, `visibility` reste PRIVATE, et l'image sort en 404
   * chez le visiteur : c'est exactement ce qui est arrivé à la photo du
   * sensei sur sksr.re/equipe.
   *
   * Écriture scopée au club dans `markPublic` : on ne rend pas public le
   * fichier d'un autre club. 404 quand rien n'a bougé — asset inexistant ou
   * d'un autre club, indistinctement, pour ne pas transformer l'endpoint en
   * oracle d'existence.
   */
  @Post(':id/public')
  @UseGuards(AuthGuard('jwt'))
  async makePublic(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<{ id: string; visibility: 'PUBLIC' }> {
    const clubId = this.extractClubId(req);
    const changed = await this.service.markPublic(clubId, id);
    if (!changed) throw new NotFoundException('Asset introuvable');
    return { id, visibility: 'PUBLIC' };
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  async delete(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<{ deleted: boolean }> {
    const clubId = this.extractClubId(req);
    const deleted = await this.service.delete(clubId, id);
    return { deleted };
  }
}

/**
 * Pose les en-têtes CORS ouverts utilisés par le endpoint public
 * `/media/:id`. Voir docstring de la méthode `download()` pour la
 * justification (WebView mobile sans origin).
 */
/**
 * Cache long et partagé pour le public, cache PRIVÉ pour le reste.
 *
 * Servir un justificatif comptable avec `public, immutable` autoriserait tout
 * cache intermédiaire — proxy d'entreprise, CDN, cache navigateur partagé —
 * à le conserver et à le resservir. Le contrôle d'accès en amont ne servirait
 * alors plus à rien : le fichier aurait déjà quitté le périmètre.
 */
function applyCachePolicy(
  res: Response,
  isPublic: boolean,
  signedExp?: string,
): void {
  if (isPublic) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return;
  }
  // Accès signé : cache PRIVÉ borné à ce qui reste de validité. Sans ça,
  // `no-store` refait un aller-retour par avatar à chaque rendu — un
  // annuaire de 200 adhérents en paie le prix à chaque tri. Le cache est
  // sûr parce qu'il est indexé sur l'URL, et que l'URL change à chaque
  // nouvelle signature.
  const restant = signedExp
    ? Math.floor(Number(signedExp) - Date.now() / 1000)
    : 0;
  res.setHeader(
    'Cache-Control',
    restant > 0
      ? `private, max-age=${restant}`
      : 'private, no-store, max-age=0',
  );
}

function applyOpenCors(res: Response): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, If-None-Match');
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Content-Length, Content-Type, ETag',
  );
  // `*` + credentials est rejeté par les navigateurs ; le middleware CORS
  // global pose `Access-Control-Allow-Credentials: true`, on le retire ici.
  res.removeHeader('Access-Control-Allow-Credentials');
}

/**
 * Clamp la largeur du PNG résultat de la rasterisation SVG dans des
 * bornes raisonnables. Évite qu'un client malicieux demande
 * `?w=99999999` et explose la mémoire serveur. Défaut : 256 px (assez
 * pour un logo retina dans un bubble 64 px).
 */
function clampWidth(raw: string | undefined): number {
  const n = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n <= 0) return 256;
  return Math.min(Math.max(n, 16), 1024);
}
