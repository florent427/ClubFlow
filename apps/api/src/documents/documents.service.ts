import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import {
  ClubDocument,
  ClubDocumentCategory,
  ClubDocumentField,
  ClubDocumentFieldType,
  ClubSignedDocument,
  MemberStatus,
  Prisma,
} from '@prisma/client';
import { ClubSendingDomainService } from '../mail/club-sending-domain.service';
import { MAIL_TRANSPORT } from '../mail/mail.constants';
import type { MailTransport } from '../mail/mail-transport.interface';
import { MediaAssetsService } from '../media/media-assets.service';
import { PrismaService } from '../prisma/prisma.service';
import { FieldValue, PdfSigningService } from './pdf-signing.service';

/** Input pour créer un nouveau document. */
export interface CreateDocumentInput {
  name: string;
  description?: string | null;
  category: ClubDocumentCategory;
  mediaAssetId: string;
  isRequired?: boolean;
  isActive?: boolean;
  validFrom: Date;
  validTo?: Date | null;
  minorsOnly?: boolean;
  resetAnnually?: boolean;
}

/** Input pour mettre à jour un document. */
export interface UpdateDocumentInput {
  name?: string;
  description?: string | null;
  category?: ClubDocumentCategory;
  /** Si fourni, déclenche le bump de version + invalidation des signatures. */
  mediaAssetId?: string;
  isRequired?: boolean;
  isActive?: boolean;
  validFrom?: Date;
  validTo?: Date | null;
  minorsOnly?: boolean;
  resetAnnually?: boolean;
}

/** Input pour upsert d'un field positionné sur le PDF. */
export interface FieldInput {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fieldType: ClubDocumentFieldType;
  required?: boolean;
  label?: string | null;
  sortOrder?: number;
}

/** Valeur saisie pour un field au moment de la signature. */
export interface SignFieldValueInput {
  fieldId: string;
  type: ClubDocumentFieldType;
  valuePngBase64?: string | null;
  text?: string | null;
  bool?: boolean | null;
}

/** Input pour la signature complète d'un document. */
export interface SignDocumentInput {
  documentId: string;
  memberId?: string | null;
  fieldValues: SignFieldValueInput[];
}

/** Métadonnées d'audit trail (IP + user-agent). */
export interface SignatureAudit {
  ip?: string | null;
  userAgent?: string | null;
}

/** Résultat agrégé des stats de signature pour le suivi admin. */
export interface SignatureStats {
  totalRequired: number;
  totalSigned: number;
  percentSigned: number;
  unsignedMemberIds: string[];
}

/**
 * Cœur du module Documents à signer.
 *
 *  - CRUD admin sur les ClubDocument + leurs fields.
 *  - Versionning : changement de fichier source → bump version + invalidation
 *    des signatures précédentes (audit trail conservé).
 *  - Signature côté membre : génération du PDF signé via overlay pdf-lib,
 *    hash SHA-256 source + signé, audit IP/user-agent.
 *  - Stats de couverture par document (pour le dashboard admin).
 */
@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaAssets: MediaAssetsService,
    private readonly pdfSigning: PdfSigningService,
    private readonly sendingDomains: ClubSendingDomainService,
    @Inject(MAIL_TRANSPORT) private readonly mail: MailTransport,
  ) {}

  // ========================================================================
  // Admin — CRUD documents
  // ========================================================================

  listDocuments(
    clubId: string,
  ): Promise<Array<ClubDocument & { fields: ClubDocumentField[] }>> {
    return this.prisma.clubDocument.findMany({
      where: { clubId },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });
  }

  getDocument(
    clubId: string,
    id: string,
  ): Promise<(ClubDocument & { fields: ClubDocumentField[] }) | null> {
    return this.prisma.clubDocument.findFirst({
      where: { id, clubId },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async createDocument(
    clubId: string,
    input: CreateDocumentInput,
  ): Promise<ClubDocument & { fields: ClubDocumentField[] }> {
    if (input.validTo && input.validTo <= input.validFrom) {
      throw new BadRequestException(
        '`validTo` doit être strictement postérieur à `validFrom`.',
      );
    }
    const sourceBuffer = await this.readMediaAssetBuffer(
      clubId,
      input.mediaAssetId,
    );
    const fileSha256 = computeSha256(sourceBuffer);

    return this.prisma.clubDocument.create({
      data: {
        clubId,
        category: input.category,
        name: input.name,
        description: input.description ?? null,
        mediaAssetId: input.mediaAssetId,
        version: 1,
        fileSha256,
        isRequired: input.isRequired ?? true,
        isActive: input.isActive ?? true,
        validFrom: input.validFrom,
        validTo: input.validTo ?? null,
        minorsOnly: input.minorsOnly ?? false,
        resetAnnually: input.resetAnnually ?? false,
      },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async updateDocument(
    clubId: string,
    id: string,
    input: UpdateDocumentInput,
  ): Promise<ClubDocument & { fields: ClubDocumentField[] }> {
    const existing = await this.prisma.clubDocument.findFirst({
      where: { id, clubId },
    });
    if (!existing) {
      throw new NotFoundException('Document introuvable');
    }

    if (
      input.validFrom &&
      input.validTo &&
      input.validTo <= input.validFrom
    ) {
      throw new BadRequestException(
        '`validTo` doit être strictement postérieur à `validFrom`.',
      );
    }

    const data: Prisma.ClubDocumentUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined)
      data.description = input.description ?? null;
    if (input.category !== undefined) data.category = input.category;
    if (input.isRequired !== undefined) data.isRequired = input.isRequired;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.validFrom !== undefined) data.validFrom = input.validFrom;
    if (input.validTo !== undefined) data.validTo = input.validTo ?? null;
    if (input.minorsOnly !== undefined) data.minorsOnly = input.minorsOnly;
    if (input.resetAnnually !== undefined)
      data.resetAnnually = input.resetAnnually;

    // Changement du fichier source = nouvelle version : on bump le numéro,
    // on recalcule le hash, et on invalide toutes les signatures existantes.
    if (input.mediaAssetId && input.mediaAssetId !== existing.mediaAssetId) {
      const sourceBuffer = await this.readMediaAssetBuffer(
        clubId,
        input.mediaAssetId,
      );
      data.fileSha256 = computeSha256(sourceBuffer);
      data.mediaAsset = { connect: { id: input.mediaAssetId } };
      data.version = { increment: 1 };

      const now = new Date();
      const [updated] = await this.prisma.$transaction([
        this.prisma.clubDocument.update({
          where: { id },
          data,
          include: { fields: { orderBy: { sortOrder: 'asc' } } },
        }),
        this.prisma.clubSignedDocument.updateMany({
          where: { documentId: id, invalidatedAt: null },
          data: { invalidatedAt: now },
        }),
      ]);
      return updated;
    }

    return this.prisma.clubDocument.update({
      where: { id },
      data,
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async archiveDocument(
    clubId: string,
    id: string,
  ): Promise<ClubDocument & { fields: ClubDocumentField[] }> {
    const existing = await this.prisma.clubDocument.findFirst({
      where: { id, clubId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Document introuvable');
    }
    return this.prisma.clubDocument.update({
      where: { id },
      data: { isActive: false },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async deleteDocument(clubId: string, id: string): Promise<boolean> {
    const existing = await this.prisma.clubDocument.findFirst({
      where: { id, clubId },
      select: {
        id: true,
        _count: { select: { signedDocuments: true } },
      },
    });
    if (!existing) {
      throw new NotFoundException('Document introuvable');
    }
    if (existing._count.signedDocuments > 0) {
      throw new ConflictException(
        'Impossible de supprimer : des signatures existent. ' +
          "Archive le document plutôt (isActive=false) pour préserver l'audit trail.",
      );
    }
    await this.prisma.clubDocument.delete({ where: { id } });
    return true;
  }

  // ========================================================================
  // Admin — Fields (zones positionnées sur le PDF)
  // ========================================================================

  async upsertFields(
    clubId: string,
    documentId: string,
    fields: FieldInput[],
  ): Promise<ClubDocumentField[]> {
    const existing = await this.prisma.clubDocument.findFirst({
      where: { id: documentId, clubId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Document introuvable');
    }
    // Validation cohérence coordonnées (déjà filtrée par class-validator côté
    // DTO, mais le service est aussi appelé en interne — on re-vérifie).
    for (const f of fields) {
      if (
        f.x < 0 ||
        f.x > 1 ||
        f.y < 0 ||
        f.y > 1 ||
        f.width < 0 ||
        f.width > 1 ||
        f.height < 0 ||
        f.height > 1
      ) {
        throw new BadRequestException(
          'Coordonnées x/y/width/height doivent être en [0, 1] (en %).',
        );
      }
      if (f.x + f.width > 1.0001 || f.y + f.height > 1.0001) {
        throw new BadRequestException(
          'Champ hors page : x+width et y+height doivent rester ≤ 1.',
        );
      }
      if (!Number.isInteger(f.page) || f.page < 1) {
        throw new BadRequestException('`page` doit être un entier ≥ 1.');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.clubDocumentField.deleteMany({ where: { documentId } });
      if (fields.length > 0) {
        await tx.clubDocumentField.createMany({
          data: fields.map((f) => ({
            documentId,
            page: f.page,
            x: f.x,
            y: f.y,
            width: f.width,
            height: f.height,
            fieldType: f.fieldType,
            required: f.required ?? true,
            label: f.label ?? null,
            sortOrder: f.sortOrder ?? 0,
          })),
        });
      }
    });

    return this.prisma.clubDocumentField.findMany({
      where: { documentId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  // ========================================================================
  // Membre — Documents à signer / signature
  // ========================================================================

  /**
   * Liste les documents que ce viewer doit encore signer pour la version
   * courante. Filtres :
   *  - isActive=true ET isRequired=true
   *  - dans la fenêtre validFrom/validTo
   *  - pas de ClubSignedDocument pour ce userId+memberId à cette version
   *  - si minorsOnly=true, le memberId doit pointer un mineur.
   */
  async listToSignForViewer(
    clubId: string,
    userId: string,
    memberId?: string | null,
  ): Promise<Array<ClubDocument & { fields: ClubDocumentField[] }>> {
    const now = new Date();
    const docs = await this.prisma.clubDocument.findMany({
      where: {
        clubId,
        isActive: true,
        isRequired: true,
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gte: now } }],
      },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    if (docs.length === 0) return [];

    // Pour minorsOnly, on a besoin de la birthDate du member visé.
    let memberIsMinor = false;
    if (memberId) {
      const m = await this.prisma.member.findFirst({
        where: { id: memberId, clubId },
        select: { birthDate: true },
      });
      memberIsMinor = m?.birthDate ? isMinor(m.birthDate) : false;
    }

    // Signatures existantes pour ce userId + memberId.
    const existingSignatures = await this.prisma.clubSignedDocument.findMany({
      where: {
        clubId,
        userId,
        memberId: memberId ?? null,
        invalidatedAt: null,
      },
      select: { documentId: true, version: true },
    });
    const signedKey = new Set(
      existingSignatures.map((s) => `${s.documentId}:${s.version}`),
    );

    return docs.filter((d) => {
      // minorsOnly : ne garder que les docs si le member est mineur.
      if (d.minorsOnly && !memberIsMinor) return false;
      // Déjà signé pour cette version ?
      if (signedKey.has(`${d.id}:${d.version}`)) return false;
      return true;
    });
  }

  async signDocument(
    clubId: string,
    userId: string,
    input: SignDocumentInput,
    audit: SignatureAudit,
  ): Promise<ClubSignedDocument> {
    const doc = await this.prisma.clubDocument.findFirst({
      where: { id: input.documentId, clubId },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!doc) {
      throw new NotFoundException('Document introuvable');
    }
    if (!doc.isActive) {
      throw new BadRequestException('Document désactivé.');
    }

    const valuesByFieldId = new Map<string, FieldValue>();
    for (const v of input.fieldValues) {
      valuesByFieldId.set(v.fieldId, {
        type: v.type,
        valuePngBase64: v.valuePngBase64 ?? null,
        text: v.text ?? null,
        bool: v.bool ?? null,
      });
    }

    // Validation : tous les fields requis doivent avoir une valeur
    // cohérente avec leur type.
    for (const field of doc.fields) {
      if (!field.required) continue;
      const v = valuesByFieldId.get(field.id);
      if (!v) {
        throw new BadRequestException(
          `Champ requis manquant : ${field.label ?? field.id}`,
        );
      }
      if (v.type !== field.fieldType) {
        throw new BadRequestException(
          `Type incohérent pour le champ ${field.label ?? field.id} : attendu ${field.fieldType}, reçu ${v.type}.`,
        );
      }
      switch (field.fieldType) {
        case ClubDocumentFieldType.SIGNATURE:
          if (!v.valuePngBase64 || v.valuePngBase64.trim().length === 0) {
            throw new BadRequestException(
              `Signature manquante pour le champ ${field.label ?? field.id}.`,
            );
          }
          break;
        case ClubDocumentFieldType.TEXT:
          if (!v.text || v.text.trim().length === 0) {
            throw new BadRequestException(
              `Texte manquant pour le champ ${field.label ?? field.id}.`,
            );
          }
          break;
        case ClubDocumentFieldType.DATE:
          // DATE accepte fallback "date du jour" → pas de check strict.
          break;
        case ClubDocumentFieldType.CHECKBOX:
          if (v.bool !== true) {
            throw new BadRequestException(
              `Case obligatoire à cocher : ${field.label ?? field.id}.`,
            );
          }
          break;
      }
    }

    // Lecture du PDF source.
    const sourceBuffer = await this.readMediaAssetBuffer(
      clubId,
      doc.mediaAssetId,
    );

    // Génération du PDF signé.
    const signedBuffer = await this.pdfSigning.render(
      sourceBuffer,
      doc.fields,
      valuesByFieldId,
    );
    const signedSha256 = computeSha256(signedBuffer);

    // Upload du PDF signé en MediaAsset (kind=DOCUMENT, owner=SIGNED_DOCUMENT).
    const safeName = doc.name.replace(/[^a-zA-Z0-9_\- ]+/g, '_').slice(0, 80);
    const fileName = `${safeName || 'document'}-signed-${userId}-v${doc.version}.pdf`;
    const signedAsset = await this.mediaAssets.uploadDocument(
      clubId,
      userId,
      {
        originalname: fileName,
        mimetype: 'application/pdf',
        size: signedBuffer.byteLength,
        buffer: signedBuffer,
      },
      { kind: 'SIGNED_DOCUMENT', id: doc.id },
    );

    // Sérialisation des fieldValues pour le JSON d'audit (sans rebobiner les
    // PNGs entiers : on tronque en cas de payload volumineux pour ne pas
    // gonfler la base — la version signée reste dans le MediaAsset).
    const fieldValuesJson: Record<
      string,
      {
        type: ClubDocumentFieldType;
        valuePngBase64?: string;
        text?: string;
        bool?: boolean;
      }
    > = {};
    for (const v of input.fieldValues) {
      fieldValuesJson[v.fieldId] = {
        type: v.type,
        ...(v.valuePngBase64
          ? { valuePngBase64: v.valuePngBase64 }
          : {}),
        ...(v.text != null ? { text: v.text } : {}),
        ...(v.bool != null ? { bool: v.bool } : {}),
      };
    }

    // Création de la signature. La contrainte unique
    // (documentId, version, userId, memberId) protège contre le double-clic
    // et le replay.
    try {
      return await this.prisma.clubSignedDocument.create({
        data: {
          clubId,
          documentId: doc.id,
          version: doc.version,
          userId,
          memberId: input.memberId ?? null,
          signedAssetId: signedAsset.id,
          signedSha256,
          sourceSha256: doc.fileSha256,
          ipAddress: audit.ip ?? null,
          userAgent: audit.userAgent ?? null,
          fieldValuesJson: fieldValuesJson as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ce document a déjà été signé pour cette version.',
        );
      }
      throw err;
    }
  }

  async getSignedDocument(
    clubId: string,
    signedDocumentId: string,
  ): Promise<
    | (ClubSignedDocument & {
        signedAsset: { id: string; publicUrl: string; fileName: string };
      })
    | null
  > {
    return this.prisma.clubSignedDocument.findFirst({
      where: { id: signedDocumentId, clubId },
      include: {
        signedAsset: {
          select: { id: true, publicUrl: true, fileName: true },
        },
      },
    });
  }

  listSignaturesForDocument(
    clubId: string,
    documentId: string,
  ): Promise<ClubSignedDocument[]> {
    return this.prisma.clubSignedDocument.findMany({
      where: { clubId, documentId },
      orderBy: { signedAt: 'desc' },
    });
  }

  /**
   * Stats de couverture : combien de membres éligibles ont signé la version
   * courante. Le filtre minorsOnly limite la base éligible aux mineurs.
   */
  async getSignatureStats(
    clubId: string,
    documentId: string,
  ): Promise<SignatureStats> {
    const doc = await this.prisma.clubDocument.findFirst({
      where: { id: documentId, clubId },
      select: { id: true, version: true, minorsOnly: true },
    });
    if (!doc) {
      throw new NotFoundException('Document introuvable');
    }

    // Membres éligibles.
    const members = await this.prisma.member.findMany({
      where: { clubId, status: MemberStatus.ACTIVE },
      select: { id: true, birthDate: true },
    });
    const eligibleMembers = doc.minorsOnly
      ? members.filter((m) => m.birthDate && isMinor(m.birthDate))
      : members;
    const totalRequired = eligibleMembers.length;

    // Signatures de la version courante non invalidées, distinctes par
    // memberId. Une signature sans memberId (cas auto-signé compte
    // utilisateur) ne compte pas pour la couverture par membre.
    const signed = await this.prisma.clubSignedDocument.findMany({
      where: {
        clubId,
        documentId,
        version: doc.version,
        invalidatedAt: null,
        memberId: { not: null },
      },
      select: { memberId: true },
      distinct: ['memberId'],
    });
    const signedMemberIds = new Set(
      signed.map((s) => s.memberId).filter((id): id is string => id !== null),
    );
    const totalSigned = signedMemberIds.size;

    const unsignedMemberIds = eligibleMembers
      .filter((m) => !signedMemberIds.has(m.id))
      .map((m) => m.id);

    const percentSigned =
      totalRequired === 0 ? 0 : (totalSigned / totalRequired) * 100;

    return {
      totalRequired,
      totalSigned,
      percentSigned,
      unsignedMemberIds,
    };
  }

  // ========================================================================
  // Notifications — envoi de relances aux membres avec docs non signés
  // ========================================================================

  /**
   * Envoie un email de relance à chaque membre du club ayant au moins un
   * document requis non signé pour la version courante. Un seul email
   * par membre, listant tous les documents en attente. Les contacts sans
   * fiche membre ne sont pas relancés (leur scope de signature dépend du
   * foyer auquel ils sont rattachés).
   *
   * Retourne le nombre d'envois réussis et le nombre d'échecs (l'agrégat
   * suffit pour le feedback admin — les détails sont logués).
   */
  async sendSignatureReminders(
    clubId: string,
  ): Promise<{ sent: number; failed: number }> {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { id: true, name: true },
    });
    if (!club) {
      throw new NotFoundException('Club introuvable');
    }

    // 1. Liste tous les documents actifs+requis en cours de validité.
    const now = new Date();
    const documents = await this.prisma.clubDocument.findMany({
      where: {
        clubId,
        isActive: true,
        isRequired: true,
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gte: now } }],
      },
      select: { id: true, name: true, version: true, minorsOnly: true },
    });
    if (documents.length === 0) {
      return { sent: 0, failed: 0 };
    }

    // 2. Liste des membres ACTIFS du club, avec leur User pour récupérer
    //    le bon userId (la signature est unique par couple userId+memberId).
    const members = await this.prisma.member.findMany({
      where: { clubId, status: MemberStatus.ACTIVE },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        birthDate: true,
        userId: true,
      },
    });

    // 3. Snapshot des signatures pour la version courante de chaque doc.
    //    On indexe par documentId+version → set de memberIds qui ont signé.
    const signatures = await this.prisma.clubSignedDocument.findMany({
      where: {
        clubId,
        invalidatedAt: null,
        memberId: { not: null },
      },
      select: { documentId: true, version: true, memberId: true },
    });
    const signedByDocVersion = new Map<string, Set<string>>();
    for (const s of signatures) {
      if (!s.memberId) continue;
      const key = `${s.documentId}:${s.version}`;
      let set = signedByDocVersion.get(key);
      if (!set) {
        set = new Set();
        signedByDocVersion.set(key, set);
      }
      set.add(s.memberId);
    }

    // 4. Pour chaque membre, calcule la liste de docs en attente.
    type Pending = { id: string; name: string };
    const pendingByMember = new Map<
      string,
      { email: string; firstName: string; pending: Pending[] }
    >();
    for (const m of members) {
      const email = (m.email ?? '').trim();
      if (!email || !m.userId) continue;
      const memberMinor = m.birthDate ? isMinor(m.birthDate) : false;
      const pending: Pending[] = [];
      for (const d of documents) {
        if (d.minorsOnly && !memberMinor) continue;
        const key = `${d.id}:${d.version}`;
        if (signedByDocVersion.get(key)?.has(m.id)) continue;
        pending.push({ id: d.id, name: d.name });
      }
      if (pending.length > 0) {
        pendingByMember.set(m.id, {
          email,
          firstName: m.firstName,
          pending,
        });
      }
    }
    if (pendingByMember.size === 0) {
      return { sent: 0, failed: 0 };
    }

    // 5. Envoi des emails (une relance par membre, listant tous ses docs).
    const profile = await this.sendingDomains.getVerifiedMailProfile(
      clubId,
      'transactional',
    );
    const portalUrl =
      process.env.MEMBER_PORTAL_ORIGIN ?? 'http://localhost:5174';

    let sent = 0;
    let failed = 0;
    for (const [memberId, info] of pendingByMember) {
      const list = info.pending.map((p) => `- ${p.name}`).join('\n');
      const listHtml = info.pending
        .map((p) => `<li>${escapeReminderHtml(p.name)}</li>`)
        .join('');
      const subject = `${club.name} — Documents à signer`;
      const text = `Bonjour ${info.firstName},

Vous avez ${info.pending.length} document${info.pending.length > 1 ? 's' : ''} à signer pour ${club.name} :
${list}

Connectez-vous à votre espace membre : ${portalUrl}

Cordialement,
${club.name}`;
      const html = `
        <p>Bonjour ${escapeReminderHtml(info.firstName)},</p>
        <p>Vous avez <strong>${info.pending.length}</strong> document${info.pending.length > 1 ? 's' : ''} à signer pour <em>${escapeReminderHtml(club.name)}</em> :</p>
        <ul>${listHtml}</ul>
        <p>Connectez-vous à votre espace membre :
          <a href="${portalUrl}">Ouvrir le portail</a>
        </p>
        <p>Cordialement,<br>${escapeReminderHtml(club.name)}</p>
      `;
      try {
        await this.mail.sendEmail({
          clubId,
          kind: 'transactional',
          from: profile.from,
          to: info.email,
          subject,
          html,
          text,
        });
        sent += 1;
      } catch (err) {
        failed += 1;
        this.logger.error(
          `documents.signature_reminder_failed clubId=${clubId} memberId=${memberId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    this.logger.log(
      `documents.signature_reminders_sent clubId=${clubId} sent=${sent} failed=${failed}`,
    );
    return { sent, failed };
  }

  // ========================================================================
  // Helpers internes
  // ========================================================================

  /**
   * Lit un MediaAsset (vérifié pour ce club) sous forme de Buffer en mémoire,
   * via le stream interne du MediaAssetsService.
   */
  private async readMediaAssetBuffer(
    clubId: string,
    mediaAssetId: string,
  ): Promise<Buffer> {
    // Vérifie l'appartenance au club avant de streamer.
    await this.mediaAssets.get(clubId, mediaAssetId);
    const { stream } = await this.mediaAssets.streamFor(mediaAssetId);
    return await streamToBuffer(stream);
  }
}

function escapeReminderHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================================
// Helpers exportables (non DI — pure functions)
// ============================================================================

/** Calcule le SHA-256 hexadécimal d'un buffer. */
export function computeSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/** True si la personne a < 18 ans (calcul à la date du jour). */
export function isMinor(birthDate: Date): boolean {
  const now = new Date();
  const eighteenth = new Date(birthDate);
  eighteenth.setFullYear(eighteenth.getFullYear() + 18);
  return now < eighteenth;
}

async function streamToBuffer(
  stream: NodeJS.ReadableStream,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}
