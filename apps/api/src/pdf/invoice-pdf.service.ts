import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Génère un PDF de facture (ou d'avoir) imprimable.
 *
 * Conçu pour :
 * - petites associations → mise en page minimaliste, typographie lisible
 * - impression N&B compatible (pas de dégradés, contrastes forts)
 * - données conformes : numéro facture, date, SIRET, mentions légales
 */
@Injectable()
export class InvoicePdfService {
  private readonly logger = new Logger(InvoicePdfService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Charge le binaire d'un logo de club à partir de la valeur stockée dans
   * `Club.logoUrl`. Accepte :
   *  - data URL (`data:image/...;base64,...`)
   *  - URL HTTP(S) (`http://...` / `https://...`) — cas ClubFlow où le logo
   *    a été uploadé via `/media/:id` et stocké comme URL
   *  - chemin relatif (`/uploads/...`) → résolu contre `API_BASE_URL`
   *
   * Renvoie un Buffer PNG/JPEG directement consommable par PDFKit. Les SVG
   * sont rasterisés en PNG via `sharp` (PDFKit ne sait pas rendre SVG nativement).
   * Retourne null si la valeur est vide ou si le fetch échoue.
   */
  private async loadClubLogoBuffer(
    rawLogoUrl: string | null | undefined,
  ): Promise<Buffer | null> {
    if (!rawLogoUrl) return null;
    try {
      let raw: Buffer | null = null;
      let mime: string | null = null;

      if (rawLogoUrl.startsWith('data:')) {
        const match = /^data:([^;,]+)(?:;([^,]+))?,(.+)$/s.exec(rawLogoUrl);
        if (!match) return null;
        mime = match[1];
        const encoding = match[2];
        const payload = match[3];
        raw =
          encoding === 'base64'
            ? Buffer.from(payload, 'base64')
            : Buffer.from(decodeURIComponent(payload), 'utf8');
      } else {
        // URL absolue (http/https) ou relative à l'API (`/media/:id`,
        // `/uploads/...`). Dans tous les cas on fait un GET HTTP.
        const base =
          process.env.API_BASE_URL?.replace(/\/$/, '') ??
          'http://localhost:3000';
        const absolute = rawLogoUrl.startsWith('http')
          ? rawLogoUrl
          : `${base}${rawLogoUrl.startsWith('/') ? '' : '/'}${rawLogoUrl}`;
        const res = await fetch(absolute);
        if (!res.ok) {
          this.logger.warn(
            `Logo fetch failed: ${res.status} ${res.statusText} (${absolute})`,
          );
          return null;
        }
        mime = res.headers.get('content-type');
        raw = Buffer.from(await res.arrayBuffer());
      }

      if (!raw || raw.length === 0) return null;
      // Garde-fou : au-delà de ~5 Mo, on évite de charger l'image (et on
      // évite de toute façon un tampon trop lourd dans le PDF).
      if (raw.length > 5 * 1024 * 1024) {
        this.logger.warn(
          `Logo too large (${raw.length} bytes), skipping`,
        );
        return null;
      }

      // PDFKit ne sait rendre que PNG et JPEG nativement. On rasterise SVG /
      // WebP / autres via sharp, et on convertit en PNG (transparence gérée).
      const isPngOrJpg =
        (mime?.includes('png') || mime?.includes('jpeg')) ?? false;
      if (isPngOrJpg) {
        return raw;
      }
      try {
        const isSvg =
          mime?.includes('svg') ||
          raw
            .slice(0, 256)
            .toString('utf8')
            .trimStart()
            .toLowerCase()
            .startsWith('<svg') ||
          raw
            .slice(0, 256)
            .toString('utf8')
            .toLowerCase()
            .includes('<?xml');
        // SVG : on rend avec une density élevée (≈ 300 dpi) pour que la
        // rasterisation reste nette une fois redimensionnée à ~72pt dans
        // l'en-tête du PDF.
        const pipeline = isSvg
          ? sharp(raw, { density: 300 })
          : sharp(raw);
        const converted = await pipeline
          .resize({ width: 512, height: 512, fit: 'inside' })
          .png()
          .toBuffer();
        return converted;
      } catch (err) {
        this.logger.warn(
          `Logo conversion failed (${mime ?? 'unknown mime'}): ${
            err instanceof Error ? err.message : 'unknown error'
          }`,
        );
        return null;
      }
    } catch (err) {
      this.logger.warn(
        `Logo load failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
      return null;
    }
  }

  /**
   * Construit le PDF en mémoire et renvoie un Buffer.
   * Le contrôleur se charge de streamer/renvoyer en HTTP.
   */
  async buildInvoicePdf(clubId: string, invoiceId: string): Promise<Buffer> {
    const inv = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, clubId },
      include: {
        club: true,
        lines: {
          orderBy: { sortOrder: 'asc' },
          include: {
            member: { select: { firstName: true, lastName: true } },
            membershipProduct: { select: { label: true } },
            membershipOneTimeFee: { select: { label: true } },
            adjustments: { orderBy: { stepOrder: 'asc' } },
          },
        },
        payments: {
          orderBy: { createdAt: 'asc' },
          include: {
            paidByMember: { select: { firstName: true, lastName: true } },
            paidByContact: { select: { firstName: true, lastName: true } },
          },
        },
        family: {
          include: {
            familyMembers: {
              where: { linkRole: 'PAYER' },
              include: {
                member: {
                  select: {
                    firstName: true,
                    lastName: true,
                    email: true,
                    phone: true,
                  },
                },
                contact: {
                  select: {
                    firstName: true,
                    lastName: true,
                    phone: true,
                    user: { select: { email: true } },
                  },
                },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
        householdGroup: true,
        clubSeason: { select: { label: true } },
        parentInvoice: { select: { id: true, label: true, createdAt: true } },
      },
    });
    if (!inv) throw new NotFoundException('Facture introuvable');

    // Résolution du destinataire : on prend le premier payeur du foyer
    // responsable (PAYER via FamilyMember). Priorité au contact (compte
    // portail) puis au membre adhérent. Fallback au label du foyer.
    const payerLink = inv.family?.familyMembers?.[0] ?? null;
    const payerName = payerLink?.contact
      ? `${payerLink.contact.firstName} ${payerLink.contact.lastName}`.trim()
      : payerLink?.member
        ? `${payerLink.member.firstName} ${payerLink.member.lastName}`.trim()
        : null;
    const payerEmail =
      payerLink?.contact?.user?.email ?? payerLink?.member?.email ?? null;
    const payerPhone =
      payerLink?.contact?.phone ?? payerLink?.member?.phone ?? null;

    const isCredit = inv.isCreditNote;
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: {
        Title: isCredit
          ? `Avoir ${inv.id.slice(0, 8).toUpperCase()}`
          : `Facture ${inv.id.slice(0, 8).toUpperCase()}`,
        Author: inv.club.name,
        Subject: inv.label,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    // ===== En-tête : logo + nom club =====
    const startY = doc.y;
    let textStartX = 48;
    // Chargement du logo : accepte data URL, HTTP(S), chemin relatif, et
    // rasterise SVG via sharp. Si tout échoue on rend juste le nom en gras.
    const logoBuf = await this.loadClubLogoBuffer(inv.club.logoUrl);
    if (logoBuf) {
      try {
        doc.image(logoBuf, 48, startY, { fit: [72, 64] });
        textStartX = 130;
      } catch (err) {
        this.logger.warn(
          `Logo rendering failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        );
      }
    }

    doc
      .fillColor('#0b1d2a')
      .font('Helvetica-Bold')
      .fontSize(18)
      .text(inv.club.name, textStartX, startY, { continued: false });

    if (inv.club.address) {
      doc
        .fillColor('#495057')
        .font('Helvetica')
        .fontSize(9)
        .text(inv.club.address, textStartX, doc.y, { lineGap: 2 });
    }
    if (inv.club.siret) {
      doc
        .fillColor('#495057')
        .font('Helvetica')
        .fontSize(9)
        .text(`SIRET ${inv.club.siret}`, textStartX, doc.y);
    }
    if (inv.club.contactPhone) {
      doc
        .fillColor('#495057')
        .font('Helvetica')
        .fontSize(9)
        .text(`Tél. ${inv.club.contactPhone}`, textStartX, doc.y);
    }
    if (inv.club.contactEmail) {
      doc
        .fillColor('#495057')
        .font('Helvetica')
        .fontSize(9)
        .text(inv.club.contactEmail, textStartX, doc.y);
    }

    // ===== Bloc titre document (à droite) =====
    const headerY = startY;
    doc
      .fillColor('#0b1d2a')
      .font('Helvetica-Bold')
      .fontSize(22)
      .text(isCredit ? 'AVOIR' : 'FACTURE', 380, headerY, {
        align: 'right',
        width: 170,
      });
    doc
      .fillColor('#495057')
      .font('Helvetica')
      .fontSize(9)
      .text(`N° ${inv.id.slice(0, 8).toUpperCase()}`, 380, doc.y, {
        align: 'right',
        width: 170,
      });
    doc.text(
      `Émise le ${inv.createdAt.toLocaleDateString('fr-FR')}`,
      380,
      doc.y,
      { align: 'right', width: 170 },
    );
    if (inv.dueAt && !isCredit) {
      doc.text(`Échéance : ${inv.dueAt.toLocaleDateString('fr-FR')}`, 380, doc.y, {
        align: 'right',
        width: 170,
      });
    }
    if (isCredit && inv.parentInvoice) {
      doc
        .fillColor('#b3261e')
        .text(
          `Référence facture ${inv.parentInvoice.id.slice(0, 8).toUpperCase()}`,
          380,
          doc.y,
          { align: 'right', width: 170 },
        );
    }

    // Ligne de séparation
    doc.y = Math.max(doc.y, startY + 90);
    doc
      .moveTo(48, doc.y + 10)
      .lineTo(547, doc.y + 10)
      .strokeColor('#dee2e6')
      .lineWidth(0.5)
      .stroke();
    doc.moveDown(1.3);

    // ===== Destinataire =====
    // Le destinataire de la facture est le contact payeur du foyer (PAYER),
    // avec ses coordonnées (email, téléphone). Fallback sur le label du
    // foyer si aucun payeur n'est rattaché (cas ancien / incohérence).
    doc
      .fillColor('#0b1d2a')
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('Destinataire', 48, doc.y);
    doc
      .fillColor('#212529')
      .font('Helvetica')
      .fontSize(11);
    const clientName =
      payerName ??
      inv.family?.label ??
      inv.householdGroup?.label ??
      '—';
    doc.text(clientName);
    const clientFamilyLabel = inv.family?.label ?? inv.householdGroup?.label;
    if (payerName && clientFamilyLabel && clientFamilyLabel !== payerName) {
      doc
        .fillColor('#495057')
        .fontSize(9)
        .text(clientFamilyLabel);
    }
    if (payerEmail) {
      doc
        .fillColor('#495057')
        .fontSize(9)
        .text(payerEmail);
    }
    if (payerPhone) {
      doc
        .fillColor('#495057')
        .fontSize(9)
        .text(payerPhone);
    }
    if (inv.clubSeason?.label) {
      doc
        .fillColor('#495057')
        .fontSize(9)
        .text(`Saison ${inv.clubSeason.label}`);
    }
    doc.moveDown(0.8);

    // ===== Objet =====
    doc
      .fillColor('#0b1d2a')
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('Objet');
    doc
      .fillColor('#212529')
      .font('Helvetica')
      .fontSize(11)
      .text(inv.label);

    if (isCredit && inv.creditNoteReason) {
      doc.moveDown(0.3);
      doc
        .fillColor('#b3261e')
        .font('Helvetica-Oblique')
        .fontSize(10)
        .text(`Motif : ${inv.creditNoteReason}`);
    }
    doc.moveDown(0.8);

    // ===== Lignes =====
    const tableTop = doc.y;
    doc
      .fillColor('#ffffff')
      .rect(48, tableTop, 499, 20)
      .fill('#0b1d2a');
    doc
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('Description', 54, tableTop + 5, { width: 300 })
      .text('Bénéficiaire', 360, tableTop + 5, { width: 120 })
      .text('Montant', 460, tableTop + 5, { width: 80, align: 'right' });

    doc.y = tableTop + 24;
    doc.fillColor('#212529').font('Helvetica').fontSize(10);

    for (const line of inv.lines) {
      const y = doc.y;
      const desc =
        line.membershipProduct?.label ??
        line.membershipOneTimeFee?.label ??
        line.kind;
      const memberName = `${line.member.firstName} ${line.member.lastName}`;
      const amt = formatCents(line.baseAmountCents, isCredit);
      doc.text(desc, 54, y, { width: 300 });
      doc.text(memberName, 360, y, { width: 100 });
      doc.text(amt, 460, y, { width: 80, align: 'right' });

      // Lignes d'ajustement (remises, frais)
      for (const adj of line.adjustments) {
        const ay = doc.y + 2;
        const label = adj.reason?.trim() || adjustmentTypeLabel(adj.type);
        doc
          .fillColor('#6c757d')
          .fontSize(9)
          // « — » (em-dash) est dans WinAnsi (géré par Helvetica standard) ;
          // on évite « ↳ » qui tombait en mojibake « !³ » faute d'encodage.
          .text(`— ${label}`, 64, ay, { width: 290 });
        doc
          .fillColor('#6c757d')
          .fontSize(9)
          .text(formatCents(adj.amountCents, isCredit), 460, ay, {
            width: 80,
            align: 'right',
          });
        doc.fillColor('#212529').fontSize(10);
      }
      doc.moveDown(0.3);
    }

    // ===== Totaux =====
    doc.moveDown(0.3);
    doc
      .moveTo(360, doc.y)
      .lineTo(547, doc.y)
      .strokeColor('#dee2e6')
      .stroke();
    doc.moveDown(0.2);

    if (inv.baseAmountCents !== inv.amountCents) {
      doc
        .fillColor('#495057')
        .font('Helvetica')
        .fontSize(10)
        .text('Sous-total', 360, doc.y, { width: 90, align: 'right' });
      doc
        .fillColor('#495057')
        .text(formatCents(inv.baseAmountCents, isCredit), 460, doc.y - 12, {
          width: 80,
          align: 'right',
        });
      doc.moveDown(0.2);
      doc
        .fillColor('#495057')
        .text('Remises/ajustements', 360, doc.y, {
          width: 90,
          align: 'right',
        });
      doc
        .fillColor('#495057')
        .text(
          formatCents(inv.amountCents - inv.baseAmountCents, isCredit),
          460,
          doc.y - 12,
          { width: 80, align: 'right' },
        );
      doc.moveDown(0.2);
    }
    doc
      .fillColor('#0b1d2a')
      .font('Helvetica-Bold')
      .fontSize(12)
      .text(isCredit ? 'Montant remboursé' : 'Total à payer', 300, doc.y, {
        width: 150,
        align: 'right',
      });
    doc
      .fillColor(isCredit ? '#b3261e' : '#0b1d2a')
      .text(formatCents(inv.amountCents, isCredit), 460, doc.y - 14, {
        width: 80,
        align: 'right',
      });
    doc.moveDown(1);

    // ===== Paiements reçus =====
    if (inv.payments.length > 0 && !isCredit) {
      doc
        .fillColor('#0b1d2a')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text('Paiements reçus', 48, doc.y);
      doc.fillColor('#212529').font('Helvetica').fontSize(9);
      for (const p of inv.payments) {
        const name =
          (p.paidByMember
            ? `${p.paidByMember.firstName} ${p.paidByMember.lastName}`
            : p.paidByContact
              ? `${p.paidByContact.firstName} ${p.paidByContact.lastName}`
              : 'Règlement') + ` — ${methodLabel(p.method)}`;
        const date = p.createdAt.toLocaleDateString('fr-FR');
        doc.text(
          `${date} — ${name} — ${formatCents(p.amountCents, false)}`,
        );
      }
      doc.moveDown(0.5);
    }

    // ===== Pied de page : mentions légales =====
    const footerY = 760;
    doc
      .fontSize(8)
      .fillColor('#6c757d')
      .font('Helvetica')
      .text(inv.club.legalMentions ?? '', 48, footerY, {
        width: 499,
        align: 'center',
      });

    // ===== Tampon « ACQUITTÉE » =====
    // Facture réglée (et non avoir) → overlay en biais, rouge, en superposition
    // au centre de la page. On utilise save/rotate/restore pour ne pas impacter
    // le reste du rendu. Le tampon est semi-transparent pour laisser lire le
    // contenu sous-jacent.
    if (inv.status === InvoiceStatus.PAID && !isCredit) {
      const lastPayment =
        inv.payments.length > 0
          ? inv.payments[inv.payments.length - 1]
          : null;
      drawPaidStamp(doc, lastPayment?.createdAt ?? null);
    }

    doc.end();
    return done;
  }
}

/**
 * Dessine un tampon « ACQUITTÉE » rouge en biais au centre de la page A4.
 * Le tampon est semi-transparent pour rester non-destructif vis-à-vis du
 * contenu (lignes, totaux, mentions légales) qu'il survole.
 */
function drawPaidStamp(
  doc: PDFKit.PDFDocument,
  paidAt: Date | null,
): void {
  const pageWidth = doc.page.width; // A4 portrait ~ 595 pt
  const pageHeight = doc.page.height; // ~ 842 pt
  const cx = pageWidth / 2;
  const cy = pageHeight / 2;
  const angle = -22; // biais « fait main »

  const boxWidth = 340;
  const boxHeight = 110;
  const boxX = cx - boxWidth / 2;
  const boxY = cy - boxHeight / 2;

  doc.save();
  // Rotation autour du centre de la page.
  doc.rotate(angle, { origin: [cx, cy] });

  // Cadre double trait (imitation tampon encreur).
  doc.opacity(0.35);
  doc.lineWidth(4).strokeColor('#c0392b').rect(boxX, boxY, boxWidth, boxHeight).stroke();
  doc
    .lineWidth(1.5)
    .strokeColor('#c0392b')
    .rect(boxX + 6, boxY + 6, boxWidth - 12, boxHeight - 12)
    .stroke();

  // Texte principal.
  doc.opacity(0.45);
  doc
    .font('Helvetica-Bold')
    .fontSize(54)
    .fillColor('#c0392b')
    .text('ACQUITTÉE', boxX, boxY + 20, {
      width: boxWidth,
      align: 'center',
      lineBreak: false,
    });

  // Sous-ligne : date du dernier paiement si disponible, sinon "Facture réglée".
  doc.opacity(0.55);
  const subLabel = paidAt
    ? `Payée le ${paidAt.toLocaleDateString('fr-FR')}`
    : 'Facture réglée';
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#c0392b')
    .text(subLabel, boxX, boxY + boxHeight - 24, {
      width: boxWidth,
      align: 'center',
      lineBreak: false,
    });

  doc.opacity(1);
  doc.restore();
}

function formatCents(cents: number, negateForDisplay: boolean): string {
  const v = (cents / 100) * (negateForDisplay ? -1 : 1);
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(v);
}

function methodLabel(m: string): string {
  switch (m) {
    case 'STRIPE_CARD':
      return 'carte bancaire';
    case 'MANUAL_CASH':
      return 'espèces';
    case 'MANUAL_CHECK':
      return 'chèque';
    case 'MANUAL_TRANSFER':
      return 'virement';
    default:
      return m;
  }
}

/**
 * Mappe le type d'ajustement (enum Prisma) vers un libellé humain pour le
 * PDF. Fallback : on normalise le nom brut (SNAKE_CASE → Snake case) pour
 * qu'un futur type non-mappé reste lisible.
 */
function adjustmentTypeLabel(t: string): string {
  switch (t) {
    case 'PRORATA_SEASON':
      return 'Prorata saison';
    case 'FAMILY':
      return 'Remise famille';
    case 'PUBLIC_AID':
      return 'Aide publique';
    case 'EXCEPTIONAL':
      return 'Remise exceptionnelle';
    default: {
      const lower = t.toLowerCase().replace(/_/g, ' ');
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    }
  }
}
