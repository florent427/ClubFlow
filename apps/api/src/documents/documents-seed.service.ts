import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ClubDocumentCategory,
  ClubDocumentFieldType,
  type ClubDocument,
  type ClubDocumentField,
} from '@prisma/client';
import PDFDocumentKit = require('pdfkit');
import { MediaAssetsService } from '../media/media-assets.service';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentsService } from './documents.service';

/**
 * Templates de documents pré-remplis proposés à l'admin lorsqu'il active
 * (ou découvre) le module DOCUMENTS sur son club.
 *
 * Pourquoi un template (et pas une auto-création silencieuse) ?
 *  - Un `ClubDocument` requiert un `MediaAssetId` (le PDF source). Auto-créer
 *    avec un placeholder serait surprenant côté admin (le PDF affiché ne lui
 *    appartiendrait pas).
 *  - Avec une mutation explicite (`createClubDocumentFromTemplate`),
 *    l'admin choisit consciemment d'utiliser un PDF générique. Il pourra
 *    ensuite remplacer le PDF source via `updateClubDocument` (le bump de
 *    version automatique préservera l'audit trail si des signatures existent).
 *
 * Templates disponibles :
 *  - REGLEMENT_INTERIEUR     : à signer chaque saison (resetAnnually=true)
 *  - AUTORISATION_PARENTALE  : mineurs uniquement (minorsOnly=true)
 *  - DROIT_IMAGE             : valable de manière pérenne par défaut
 */
type TemplateConfig = {
  name: string;
  title: string;
  body: string[];
  minorsOnly: boolean;
  resetAnnually: boolean;
};

const TEMPLATES: Record<ClubDocumentCategory, TemplateConfig | null> = {
  REGLEMENT_INTERIEUR: {
    name: 'Règlement intérieur',
    title: 'Règlement intérieur du club',
    body: [
      'Le présent document constitue le règlement intérieur du club.',
      "À compléter par l'administrateur (vie associative, horaires, code de conduite, sanctions).",
      "Tout adhérent s'engage à en respecter les dispositions.",
    ],
    minorsOnly: false,
    resetAnnually: true,
  },
  AUTORISATION_PARENTALE: {
    name: 'Autorisation parentale',
    title: 'Autorisation parentale',
    body: [
      "Je soussigné(e), représentant(e) légal(e) de l'enfant adhérent,",
      "autorise mon enfant à participer aux activités du club selon les",
      'modalités définies par le règlement intérieur.',
      "À compléter par l'administrateur (clauses, prises de risques, transports).",
    ],
    minorsOnly: true,
    resetAnnually: true,
  },
  DROIT_IMAGE: {
    name: 'Droit à l\'image',
    title: "Cession de droit à l'image",
    body: [
      "J'autorise le club à utiliser les photographies et vidéos prises lors",
      'des activités auxquelles je participe (ou auxquelles participe',
      "l'enfant dont je suis représentant légal) pour ses supports de",
      'communication (site web, réseaux sociaux, plaquettes).',
      "À compléter par l'administrateur (durée, supports, droit de retrait).",
    ],
    minorsOnly: false,
    resetAnnually: false,
  },
  REGLEMENT_FEDERAL: null,
  AUTRE: null,
};

@Injectable()
export class DocumentsSeedService {
  private readonly logger = new Logger('DocumentsSeedService');

  constructor(
    private readonly documents: DocumentsService,
    private readonly mediaAssets: MediaAssetsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Crée un `ClubDocument` (avec PDF source généré côté serveur) pour la
   * catégorie demandée, à partir d'un template embarqué. Pré-positionne
   * un field SIGNATURE bas-droite pour que le doc soit immédiatement
   * signable par les membres.
   *
   * Renvoie le document complet (avec ses fields) — typage cohérent avec
   * `DocumentsService.createDocument` pour faciliter le mapping vers le
   * `ClubDocumentGraph` côté resolver.
   */
  async createDocumentFromTemplate(
    clubId: string,
    userId: string,
    category: ClubDocumentCategory,
  ): Promise<ClubDocument & { fields: ClubDocumentField[] }> {
    const tpl = TEMPLATES[category];
    if (!tpl) {
      throw new BadRequestException(
        `Aucun template disponible pour la catégorie ${category}.`,
      );
    }

    // 1. Récupère le nom du club (utilisé en header du PDF).
    const club = await this.findClubName(clubId);

    // 2. Génère le PDF placeholder via pdfkit.
    const pdfBuffer = await renderTemplatePdf({
      clubName: club.name,
      title: tpl.title,
      body: tpl.body,
    });

    // 3. Upload comme MediaAsset (kind=DOCUMENT, owner=null à ce stade —
    //    le ClubDocument prendra le relai comme propriétaire logique).
    const asset = await this.mediaAssets.uploadDocument(
      clubId,
      userId,
      {
        originalname: `${slugifyName(tpl.name)}.pdf`,
        mimetype: 'application/pdf',
        size: pdfBuffer.byteLength,
        buffer: pdfBuffer,
      },
      null,
    );

    // 4. Crée le ClubDocument via le service principal pour bénéficier
    //    du calcul de hash + de la cohérence de l'audit trail.
    const validFrom = new Date();
    const document = await this.documents.createDocument(clubId, {
      name: tpl.name,
      description: null,
      category,
      mediaAssetId: asset.id,
      isRequired: true,
      isActive: true,
      validFrom,
      validTo: null,
      minorsOnly: tpl.minorsOnly,
      resetAnnually: tpl.resetAnnually,
    });

    // 5. Pré-positionne un field SIGNATURE en bas-droite (60-95 % en x,
    //    85-93 % en y, page 1). Coordonnées en % du format de la page.
    await this.documents.upsertFields(clubId, document.id, [
      {
        page: 1,
        x: 0.6,
        y: 0.85,
        width: 0.35,
        height: 0.08,
        fieldType: ClubDocumentFieldType.SIGNATURE,
        required: true,
        label: 'Signature',
        sortOrder: 0,
      },
    ]);

    // Re-fetch pour renvoyer les fields fraîchement insérés.
    const refreshed = await this.documents.getDocument(clubId, document.id);
    if (!refreshed) {
      throw new NotFoundException('Document tout juste créé introuvable');
    }
    return refreshed;
  }

  private async findClubName(
    clubId: string,
  ): Promise<{ id: string; name: string }> {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { id: true, name: true },
    });
    if (!club) {
      throw new NotFoundException('Club introuvable');
    }
    return club;
  }
}

/**
 * Slugifie un nom pour en faire un nom de fichier sûr (PDF généré).
 */
function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'document';
}

/**
 * Génère un PDF générique pour un template donné. Header (nom du club),
 * titre, corps texte, footer "Signature : ____". Format A4 portrait.
 */
async function renderTemplatePdf(args: {
  clubName: string;
  title: string;
  body: string[];
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocumentKit({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header — nom du club, aligné droite, en gris.
    doc
      .fillColor('#475569')
      .fontSize(11)
      .text(args.clubName, { align: 'right' });
    doc.moveDown(2);

    // Titre principal centré.
    doc
      .fillColor('#0f172a')
      .fontSize(22)
      .text(args.title, { align: 'center' });
    doc.moveDown(2);

    // Corps : un paragraphe par ligne, espacement modéré.
    doc.fillColor('#1e293b').fontSize(12);
    for (const paragraph of args.body) {
      doc.text(paragraph, { align: 'justify', lineGap: 4 });
      doc.moveDown(1);
    }

    // Footer signature à 85 % de la hauteur — l'admin pourra repositionner
    // le field si nécessaire via l'éditeur web.
    const pageHeight = doc.page.height;
    const sigY = Math.round(pageHeight * 0.85);
    doc
      .fillColor('#1e293b')
      .fontSize(11)
      .text('Signature :', 50, sigY);
    doc
      .moveTo(120, sigY + 8)
      .lineTo(pageHeight, sigY + 8)
      .strokeColor('#94a3b8')
      .stroke();

    doc.end();
  });
}
