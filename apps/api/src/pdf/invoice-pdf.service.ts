import { Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
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
  constructor(private readonly prisma: PrismaService) {}

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
        family: true,
        householdGroup: true,
        clubSeason: { select: { label: true } },
        parentInvoice: { select: { id: true, label: true, createdAt: true } },
      },
    });
    if (!inv) throw new NotFoundException('Facture introuvable');

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
    // Logo : stocké en data:URL (data:image/png;base64,xxxx) — set depuis
    // la page "Identité du club" côté admin. On le rend en haut à gauche,
    // et on décale le nom du club à droite du logo.
    if (inv.club.logoUrl && inv.club.logoUrl.startsWith('data:image/')) {
      try {
        const commaIdx = inv.club.logoUrl.indexOf(',');
        if (commaIdx > 0) {
          const base64 = inv.club.logoUrl.slice(commaIdx + 1);
          const buf = Buffer.from(base64, 'base64');
          // Hauteur ~64pt : pied lisible sans manger tout l'en-tête.
          doc.image(buf, 48, startY, { fit: [72, 64] });
          textStartX = 130;
        }
      } catch {
        // Silencieux : un logo cassé ne doit pas empêcher la facture de sortir.
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
      inv.family?.label ?? inv.householdGroup?.label ?? '—';
    doc.text(clientName);
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
        doc
          .fillColor('#6c757d')
          .fontSize(9)
          .text(`↳ ${adj.reason ?? adj.type}`, 64, ay, { width: 290 });
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

    doc.end();
    return done;
  }
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
