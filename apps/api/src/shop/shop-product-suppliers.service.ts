import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ShopService } from './shop.service';

/**
 * Fournisseurs d'un produit (ADR-0021 §1-2).
 *
 * DEUX GARANTIES, et c'est la base qui les tient, pas ce service :
 *  - une seule offre par couple produit × fournisseur (`@@unique`) ;
 *  - un fournisseur choisi forcément rattaché au produit : la clé étrangère
 *    COMPOSITE `ShopProduct[id, preferredSupplierId]` → offre refuse aussi bien
 *    de choisir un fournisseur non rattaché que de retirer l'offre choisie.
 *    Ce service traduit ces refus en messages ; il ne les arbitre pas.
 *
 * Le `clubId` est vérifié sur chaque objet visé : les clés étrangères ne
 * connaissent pas le tenant, et une offre pourrait sinon naître entre le
 * produit d'un club et le fournisseur d'un autre.
 */
@Injectable()
export class ShopProductSuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shop: ShopService,
  ) {}

  /**
   * Rattache un fournisseur au produit, ou met à jour son offre.
   *
   * Le premier fournisseur rattaché est choisi d'office. La condition vit dans
   * l'écriture — produit sans choix ET dont la seule offre est celle-ci — pour
   * qu'un choix posé entre-temps ne soit jamais écrasé, et qu'un produit dont
   * le club a délibérément retiré le choix ne se le voie pas réimposer.
   */
  async upsertOffer(
    clubId: string,
    input: {
      productId: string;
      supplierId: string;
      supplierRef?: string | null;
      unitCostCents?: number | null;
      packSize?: number | null;
    },
  ) {
    await this.assertProduct(clubId, input.productId);
    const supplier = await this.prisma.shopSupplier.findFirst({
      where: { id: input.supplierId, clubId },
      select: { active: true },
    });
    if (!supplier) throw new BadRequestException('Fournisseur introuvable.');

    const terms = normalizeTerms(input);
    try {
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.shopProductSupplier.findFirst({
          where: {
            productId: input.productId,
            supplierId: input.supplierId,
            clubId,
          },
          select: { id: true },
        });
        if (existing) {
          await tx.shopProductSupplier.update({
            where: { id: existing.id },
            data: terms.update,
          });
          return;
        }
        // Un fournisseur désactivé garde ses offres — on corrige un prix —,
        // mais n'en reçoit pas de nouvelle : on ne lui commandera plus rien.
        if (!supplier.active) {
          throw new BadRequestException(
            'Ce fournisseur est désactivé : réactivez-le avant de lui rattacher un produit.',
          );
        }
        await tx.shopProductSupplier.create({
          data: {
            clubId,
            productId: input.productId,
            supplierId: input.supplierId,
            ...terms.create,
          },
        });
        await tx.shopProduct.updateMany({
          where: {
            id: input.productId,
            clubId,
            preferredSupplierId: null,
            supplierOffers: { every: { supplierId: input.supplierId } },
          },
          data: { preferredSupplierId: input.supplierId },
        });
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new BadRequestException(
          'Ce fournisseur vient d’être rattaché à ce produit : rechargez la fiche.',
        );
      }
      throw err;
    }
    return this.shop.reloadProduct(clubId, input.productId);
  }

  /**
   * Retire un fournisseur du produit, avec ses exceptions par déclinaison.
   *
   * Si c'était la DERNIÈRE offre, le choix part avec elle, dans la même
   * transaction. S'il en reste d'autres, l'effacement du choix ne s'applique
   * pas — et la base refuse alors de retirer l'offre encore choisie.
   */
  async removeOffer(
    clubId: string,
    input: { productId: string; supplierId: string },
  ) {
    await this.assertProduct(clubId, input.productId);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.shopProduct.updateMany({
          where: {
            id: input.productId,
            clubId,
            preferredSupplierId: input.supplierId,
            supplierOffers: { every: { supplierId: input.supplierId } },
          },
          data: { preferredSupplierId: null },
        });
        const removed = await tx.shopProductSupplier.deleteMany({
          where: {
            productId: input.productId,
            supplierId: input.supplierId,
            clubId,
          },
        });
        if (removed.count === 0) {
          throw new NotFoundException(
            'Ce fournisseur n’est pas rattaché à ce produit.',
          );
        }
      });
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw new BadRequestException(
          'C’est le fournisseur choisi de ce produit : choisissez-en un autre avant de le retirer.',
        );
      }
      throw err;
    }
    return this.shop.reloadProduct(clubId, input.productId);
  }

  /**
   * Choisit le fournisseur du réapprovisionnement, ou retire le choix (`null`).
   *
   * Aucune lecture préalable de l'offre : c'est la clé étrangère composite qui
   * refuse un fournisseur non rattaché. La lecture du fournisseur ne sert qu'à
   * refuser, avec un message utile, un fournisseur désactivé.
   */
  async setPreferredSupplier(
    clubId: string,
    input: { productId: string; supplierId?: string | null },
  ) {
    await this.assertProduct(clubId, input.productId);
    const supplierId = input.supplierId ?? null;
    if (supplierId !== null) {
      const supplier = await this.prisma.shopSupplier.findFirst({
        where: { id: supplierId, clubId },
        select: { active: true },
      });
      if (!supplier) throw new BadRequestException('Fournisseur introuvable.');
      if (!supplier.active) {
        throw new BadRequestException(
          'Ce fournisseur est désactivé : réactivez-le avant de le choisir.',
        );
      }
    }
    try {
      await this.prisma.shopProduct.updateMany({
        where: { id: input.productId, clubId },
        data: { preferredSupplierId: supplierId },
      });
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw new BadRequestException(
          'Rattachez d’abord ce fournisseur au produit avant de le choisir.',
        );
      }
      throw err;
    }
    return this.shop.reloadProduct(clubId, input.productId);
  }

  /**
   * Pose l'exception d'une déclinaison pour une offre : référence et prix
   * REMPLACÉS par ceux fournis. Les deux vides suppriment l'exception.
   */
  async setVariantOverride(
    clubId: string,
    input: {
      offerId: string;
      variantId: string;
      supplierRef?: string | null;
      unitCostCents?: number | null;
    },
  ) {
    const offer = await this.prisma.shopProductSupplier.findFirst({
      where: { id: input.offerId, clubId },
      select: { productId: true },
    });
    if (!offer) {
      throw new BadRequestException('Fournisseur du produit introuvable.');
    }
    // La déclinaison doit être du MÊME produit que l'offre : sinon le prix d'un
    // t-shirt s'appliquerait à une casquette achetée chez le même fournisseur.
    const variant = await this.prisma.shopProductVariant.findFirst({
      where: { id: input.variantId, clubId, productId: offer.productId },
      select: { id: true },
    });
    if (!variant) {
      throw new BadRequestException('Déclinaison introuvable pour ce produit.');
    }

    const supplierRef = input.supplierRef?.trim() || null;
    const unitCostCents = input.unitCostCents ?? null;
    assertCost(unitCostCents);

    if (supplierRef === null && unitCostCents === null) {
      await this.prisma.shopProductSupplierVariant.deleteMany({
        where: { offerId: input.offerId, variantId: input.variantId, clubId },
      });
    } else {
      await this.prisma.shopProductSupplierVariant.upsert({
        where: {
          offerId_variantId: {
            offerId: input.offerId,
            variantId: input.variantId,
          },
        },
        create: {
          clubId,
          offerId: input.offerId,
          variantId: input.variantId,
          supplierRef,
          unitCostCents,
        },
        update: { supplierRef, unitCostCents },
      });
    }
    return this.shop.reloadProduct(clubId, offer.productId);
  }

  /** Nombre de produits rattachés à chaque fournisseur du club. */
  async productCountsBySupplier(clubId: string) {
    const rows = await this.prisma.shopProductSupplier.groupBy({
      by: ['supplierId'],
      where: { clubId },
      _count: { _all: true },
    });
    return rows.map((r) => ({
      supplierId: r.supplierId,
      productCount: r._count._all,
    }));
  }

  private async assertProduct(clubId: string, productId: string) {
    const found = await this.prisma.shopProduct.findFirst({
      where: { id: productId, clubId },
      select: { id: true },
    });
    if (!found) throw new BadRequestException('Produit introuvable.');
  }
}

/**
 * Conditions d'une offre. Revalidées ici et pas seulement par le DTO : le
 * service est appelable hors GraphQL.
 */
function normalizeTerms(input: {
  supplierRef?: string | null;
  unitCostCents?: number | null;
  packSize?: number | null;
}) {
  if (
    input.packSize != null &&
    (!Number.isInteger(input.packSize) || input.packSize < 1)
  ) {
    throw new BadRequestException('Le colisage compte au moins une unité.');
  }
  assertCost(input.unitCostCents ?? null);

  const supplierRef =
    input.supplierRef === undefined
      ? undefined
      : input.supplierRef?.trim() || null;

  const update: {
    supplierRef?: string | null;
    unitCostCents?: number | null;
    packSize?: number;
  } = {};
  if (supplierRef !== undefined) update.supplierRef = supplierRef;
  if (input.unitCostCents !== undefined) update.unitCostCents = input.unitCostCents;
  if (input.packSize != null) update.packSize = input.packSize;

  return {
    update,
    create: {
      supplierRef: supplierRef ?? null,
      unitCostCents: input.unitCostCents ?? null,
      packSize: input.packSize ?? 1,
    },
  };
}

function assertCost(unitCostCents: number | null) {
  if (
    unitCostCents !== null &&
    (!Number.isInteger(unitCostCents) || unitCostCents < 0)
  ) {
    throw new BadRequestException('Le prix d’achat ne peut pas être négatif.');
  }
}

function isForeignKeyViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003'
  );
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}
