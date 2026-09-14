import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ShopPurchaseOrderStatus } from '@prisma/client';
import { TransactionalMailService } from '../mail/transactional-mail.service';
import {
  ShopPurchaseOrderPdfService,
  type ShopPurchaseOrderPdfData,
} from '../pdf/shop-purchase-order-pdf.service';
import { PrismaService } from '../prisma/prisma.service';
import { ShopPurchaseOrderSendMode } from './dto/send-shop-purchase-order.input';
import { effectiveTerms } from './restock-plan';
import { ShopDeliveryNoteLinkService } from './shop-delivery-note-link.service';
import { ShopPurchaseOrdersService } from './shop-purchase-orders.service';

/** Adresse plausible : ce qui sépare une faute de frappe d'un envoi perdu. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const INTROUVABLE = 'Commande fournisseur introuvable.';

/** Partie et encore attendue : la seule commande dont le bon se renvoie. */
const RESENDABLE: ShopPurchaseOrderStatus[] = [
  ShopPurchaseOrderStatus.ORDERED,
  ShopPurchaseOrderStatus.PARTIALLY_RECEIVED,
];

function supplierAddress(email: string | null): string | null {
  const trimmed = email?.trim() ?? '';
  return EMAIL.test(trimmed) ? trimmed : null;
}

/**
 * Le bon de commande fournisseur (ADR-0021 §5) : le produire, l'ouvrir sur
 * l'écran de l'admin, l'envoyer par e-mail et garder la preuve de l'envoi.
 *
 * Service distinct de `ShopPurchaseOrdersService`, comme le bon de livraison
 * l'est de `ShopService` : les transitions et l'encours ne connaissent ni la
 * messagerie ni le PDF.
 */
@Injectable()
export class ShopPurchaseOrderNoteService {
  private readonly logger = new Logger(ShopPurchaseOrderNoteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly purchases: ShopPurchaseOrdersService,
    private readonly pdf: ShopPurchaseOrderPdfService,
    private readonly mail: TransactionalMailService,
    private readonly links: ShopDeliveryNoteLinkService,
  ) {}

  /** Ce que le bon imprime, lu pour CE club. Null : commande introuvable. */
  async document(
    clubId: string,
    orderId: string,
  ): Promise<ShopPurchaseOrderPdfData | null> {
    const order = await this.prisma.shopPurchaseOrder.findFirst({
      where: { id: orderId, clubId },
      select: {
        supplierId: true,
        reference: true,
        orderedAt: true,
        expectedAt: true,
        notes: true,
        club: {
          select: { name: true, siret: true, address: true, contactEmail: true, contactPhone: true },
        },
        supplier: {
          select: { name: true, contactName: true, email: true, phone: true, accountRef: true },
        },
        lines: {
          orderBy: { createdAt: 'asc' },
          select: {
            variantId: true,
            orderedQty: true,
            unitCostCents: true,
            variant: {
              select: { productId: true, label: true, product: { select: { name: true } } },
            },
          },
        },
      },
    });
    if (!order) return null;

    // Les références chez LE fournisseur de la commande : l'offre d'un autre
    // fournisseur ne dit rien de son catalogue.
    const offers =
      order.lines.length === 0
        ? []
        : await this.prisma.shopProductSupplier.findMany({
            where: {
              clubId,
              supplierId: order.supplierId,
              productId: { in: [...new Set(order.lines.map((l) => l.variant.productId))] },
            },
            select: {
              productId: true,
              supplierRef: true,
              unitCostCents: true,
              variantOverrides: {
                where: { clubId, variantId: { in: order.lines.map((l) => l.variantId) } },
                select: { variantId: true, supplierRef: true, unitCostCents: true },
              },
            },
          });

    return {
      club: order.club,
      supplier: order.supplier,
      order: {
        reference: order.reference,
        orderedAt: order.orderedAt,
        expectedAt: order.expectedAt,
        notes: order.notes,
        lines: order.lines.map((l) => {
          const offer = offers.find((o) => o.productId === l.variant.productId);
          const override = offer?.variantOverrides.find((x) => x.variantId === l.variantId);
          return {
            supplierRef: offer ? effectiveTerms(offer, override).supplierRef : null,
            label: l.variant.label
              ? `${l.variant.product.name} — ${l.variant.label}`
              : l.variant.product.name,
            quantity: l.orderedQty,
            // Le prix de LA COMMANDE : c'est lui que le club s'attend à payer.
            unitCostCents: l.unitCostCents,
          };
        }),
      },
    };
  }

  /** Lien signé et court vers le bon d'une commande de CE club. */
  async link(clubId: string, orderId: string): Promise<string> {
    const order = await this.prisma.shopPurchaseOrder.findFirst({
      where: { id: orderId, clubId },
      select: { id: true },
    });
    if (!order) throw new NotFoundException(INTROUVABLE);
    return this.links.purchaseOrderUrl(clubId, orderId);
  }

  /**
   * Envoie la commande au fournisseur.
   *
   * MARK_ONLY : la transition seule. EMAIL : la transition, PUIS le bon de
   * commande par e-mail. L'ordre est délibéré : l'encours est une garantie,
   * l'e-mail un accessoire (cf. pitfalls/garantie-derriere-effet-de-bord.md).
   * Un e-mail en échec laisse la commande envoyée, `emailedAt` vide — l'écran
   * dit « non transmise » et propose de renvoyer —, et le message est RENDU :
   * lever ferait croire que la commande n'est pas partie.
   *
   * Sans adresse valide, le mode EMAIL est refusé AVANT la transition.
   */
  async send(clubId: string, orderId: string, mode: ShopPurchaseOrderSendMode) {
    let to: string | null = null;
    if (mode === ShopPurchaseOrderSendMode.EMAIL) {
      const current = await this.prisma.shopPurchaseOrder.findFirst({
        where: { id: orderId, clubId },
        select: { supplier: { select: { email: true } } },
      });
      if (!current) throw new NotFoundException(INTROUVABLE);
      to = supplierAddress(current.supplier.email);
      if (!to) {
        throw new BadRequestException(
          'Ce fournisseur n’a pas d’adresse e-mail valide : renseignez-la sur sa fiche, ou marquez la commande comme envoyée.',
        );
      }
    }

    // La transition, dans sa propre transaction : refusée, elle lève — et rien
    // n'est parti chez le fournisseur.
    await this.purchases.sendOrder(clubId, orderId);

    const emailError = to ? await this.transmit(clubId, orderId, to) : null;
    return { order: await this.purchases.getOrder(clubId, orderId), emailError };
  }

  /** Renvoie le bon d'une commande partie. Rien ne transite : un échec lève. */
  async resend(clubId: string, orderId: string) {
    const current = await this.prisma.shopPurchaseOrder.findFirst({
      where: { id: orderId, clubId },
      select: { status: true, supplier: { select: { email: true } } },
    });
    if (!current) throw new NotFoundException(INTROUVABLE);
    if (!RESENDABLE.includes(current.status)) {
      throw new BadRequestException(
        'Seule une commande envoyée, et pas encore entièrement reçue, se renvoie au fournisseur.',
      );
    }
    const to = supplierAddress(current.supplier.email);
    if (!to) {
      throw new BadRequestException(
        'Ce fournisseur n’a pas d’adresse e-mail valide : renseignez-la sur sa fiche.',
      );
    }
    const error = await this.transmit(clubId, orderId, to);
    if (error) throw new BadRequestException(error);
    return this.purchases.getOrder(clubId, orderId);
  }

  /**
   * Produit le bon, l'envoie, puis en garde la preuve. Ne lève JAMAIS : rend le
   * message à montrer, ou null. `emailedAt` n'est posé qu'après un envoi
   * accepté par le relais : une date d'envoi ne ment pas.
   */
  private async transmit(clubId: string, orderId: string, to: string): Promise<string | null> {
    try {
      const doc = await this.document(clubId, orderId);
      if (!doc) throw new NotFoundException(INTROUVABLE);
      const pdf = await this.pdf.build(doc);
      await this.mail.sendShopPurchaseOrder(clubId, to, {
        clubName: doc.club.name,
        clubContactEmail: doc.club.contactEmail,
        orderReference: doc.order.reference,
        expectedAt: doc.order.expectedAt,
        pdf,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[appro] bon de commande NON TRANSMIS — commande ${orderId} (club ${clubId}) vers ${to} : ${reason}`,
      );
      return `Le bon de commande n’est pas parti : ${reason}`;
    }
    try {
      await this.prisma.shopPurchaseOrder.updateMany({
        where: { id: orderId, clubId },
        data: { emailedAt: new Date(), emailedTo: to },
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[appro] bon de commande PARTI, preuve NON ENREGISTRÉE — commande ${orderId} (club ${clubId}) vers ${to} : ${reason}`,
      );
      // Parti quand même : le dire, pour qu'on ne le renvoie pas à l'aveugle.
      return `Le bon de commande est parti chez ${to}, mais la date d’envoi n’a pas pu être enregistrée : ${reason}`;
    }
    return null;
  }
}
