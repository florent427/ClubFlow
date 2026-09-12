import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ShopService } from './shop.service';
import { ShopStockService } from './shop-stock.service';

/**
 * Plafond de la matrice engendrée par `generateShopProductVariants`.
 *
 * Trois axes de six valeurs font déjà 216 lignes ; au-delà, l'admin ne gère
 * plus rien à l'écran et chaque relecture de fiche produit coûte une requête
 * proportionnelle. On refuse net plutôt que de créer un produit inutilisable.
 */
const MAX_MATRIX_SIZE = 200;

/** Un axe et ses valeurs, tels que saisis par l'admin. */
export type OptionAxisInput = { name: string; values: string[] };

export type UpdateVariantInput = {
  label?: string | null;
  sku?: string | null;
  priceCents?: number | null;
  trackStock?: boolean;
  reorderThreshold?: number | null;
  reorderTargetQty?: number | null;
  active?: boolean;
};

/**
 * Signature canonique d'une combinaison (ADR-0012 §5).
 *
 * Identifiants de valeurs TRIÉS puis joints par « | ». Le tri est ce qui rend
 * la signature canonique : sans lui, {rouge, L} et {L, rouge} produiraient
 * deux chaînes différentes pour la même combinaison, et le `@@unique` ne
 * mordrait plus. Chaîne VIDE pour la variante par défaut — une valeur, et non
 * un NULL, sans quoi PostgreSQL laisserait cohabiter plusieurs « variantes
 * par défaut » sur le même produit.
 */
export function optionSignature(valueIds: string[]): string {
  return [...valueIds].sort().join('|');
}

@Injectable()
export class ShopVariantsService {
  private readonly logger = new Logger(ShopVariantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shop: ShopService,
    private readonly stock: ShopStockService,
  ) {}

  // --- Axes de variation ---

  /** Les axes d'un produit, dans l'ordre d'affichage du sélecteur. */
  async listOptions(clubId: string, productId: string) {
    await this.assertProduct(clubId, productId);
    return this.prisma.shopProductOption.findMany({
      where: { clubId, productId },
      orderBy: { position: 'asc' },
      include: { values: { orderBy: { position: 'asc' } } },
    });
  }

  /**
   * Définit les axes d'un produit et leurs valeurs.
   *
   * Remplace intégralement la définition : un axe absent de l'entrée est
   * supprimé, une valeur absente aussi. Les variantes ne sont PAS touchées par
   * ce remplacement — elles sont réévaluées ensuite (cf. `deactivateStale`).
   */
  async setOptions(clubId: string, productId: string, axes: OptionAxisInput[]) {
    await this.assertProduct(clubId, productId);

    const cleaned = axes.map((axis, index) => {
      const name = axis.name.trim();
      if (name.length === 0) {
        throw new BadRequestException('Un axe de déclinaison doit être nommé.');
      }
      const values = Array.from(
        new Set(axis.values.map((v) => v.trim()).filter((v) => v.length > 0)),
      );
      if (values.length === 0) {
        throw new BadRequestException(
          `L'axe « ${name} » doit proposer au moins une valeur.`,
        );
      }
      return { name, values, position: index };
    });

    const names = cleaned.map((a) => a.name);
    if (new Set(names).size !== names.length) {
      throw new BadRequestException(
        'Deux axes ne peuvent pas porter le même nom : la combinaison serait ambiguë.',
      );
    }

    const size = cleaned.reduce((acc, a) => acc * a.values.length, 1);
    if (cleaned.length > 0 && size > MAX_MATRIX_SIZE) {
      throw new BadRequestException(
        `Ces axes engendreraient ${size} déclinaisons (maximum ${MAX_MATRIX_SIZE}).`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.shopProductOption.findMany({
        where: { clubId, productId },
        include: { values: true },
      });

      // Suppression des axes disparus. La cascade emporte leurs valeurs ; les
      // variantes qui s'y référaient deviennent caduques et seront désactivées
      // par `deactivateStale`, jamais supprimées.
      const keptNames = new Set(names);
      const dropped = existing.filter((o) => !keptNames.has(o.name));
      if (dropped.length > 0) {
        await tx.shopProductOption.deleteMany({
          where: { id: { in: dropped.map((o) => o.id) } },
        });
      }

      for (const axis of cleaned) {
        const prev = existing.find((o) => o.name === axis.name);
        const option = prev
          ? await tx.shopProductOption.update({
              where: { id: prev.id },
              data: { position: axis.position },
            })
          : await tx.shopProductOption.create({
              data: {
                clubId,
                productId,
                name: axis.name,
                position: axis.position,
              },
            });

        const prevValues = prev?.values ?? [];
        const kept = new Set(axis.values);
        const goneIds = prevValues
          .filter((v) => !kept.has(v.value))
          .map((v) => v.id);
        if (goneIds.length > 0) {
          await tx.shopProductOptionValue.deleteMany({
            where: { id: { in: goneIds } },
          });
        }

        for (const [position, value] of axis.values.entries()) {
          const prevValue = prevValues.find((v) => v.value === value);
          if (prevValue) {
            await tx.shopProductOptionValue.update({
              where: { id: prevValue.id },
              data: { position },
            });
          } else {
            await tx.shopProductOptionValue.create({
              data: { clubId, optionId: option.id, value, position },
            });
          }
        }
      }
    });

    await this.deactivateStale(clubId, productId);
    return this.shop.reloadProduct(clubId, productId);
  }

  /**
   * Désactive — JAMAIS ne supprime — les variantes dont la signature n'est
   * plus une combinaison valide des axes courants.
   *
   * Une seule règle, qui couvre trois situations d'un coup :
   *
   *  1. un produit SIMPLE reçoit ses premiers axes : la signature vide de sa
   *     variante par défaut cesse d'être une combinaison valide, donc la
   *     variante est désactivée ;
   *  2. une valeur d'axe est retirée : les variantes qui la portaient tombent ;
   *  3. un axe est AJOUTÉ à un produit qui en avait déjà : toutes les anciennes
   *     signatures deviennent incomplètes, donc caduques.
   *
   * Désactiver et non supprimer, parce que `ShopOrderLine.variant` porte un
   * `onDelete: Restrict` : une variante déjà commandée ne peut pas disparaître
   * sans emporter l'historique qui la référence. Une suppression échouerait sur
   * la contrainte pour les produits déjà vendus et réussirait pour les autres —
   * soit exactement le genre de comportement qui ne se manifeste qu'en
   * production, chez le seul club qui a des commandes.
   *
   * La réactivation reste MANUELLE (`updateShopProductVariant`) : la faire
   * automatiquement ressusciterait aussi les variantes que l'admin avait
   * délibérément retirées de la vente.
   */
  private async deactivateStale(clubId: string, productId: string) {
    const combos = await this.combinations(clubId, productId);
    // Aucun axe : la seule combinaison valide est la signature VIDE, et la
    // variante par défaut d'un produit simple doit donc rester active. C'est
    // le cas qui empêche cette méthode de désactiver tout un catalogue de
    // produits simples.
    const valid =
      combos.length === 0
        ? new Set([''])
        : new Set(combos.map((c) => c.signature));

    const variants = await this.prisma.shopProductVariant.findMany({
      where: { clubId, productId, active: true },
      select: { id: true, optionSignature: true },
    });
    const staleIds = variants
      .filter((v) => !valid.has(v.optionSignature))
      .map((v) => v.id);
    if (staleIds.length === 0) return;

    await this.prisma.shopProductVariant.updateMany({
      where: { id: { in: staleIds }, clubId },
      data: { active: false },
    });
    this.logger.log(
      `[boutique] ${staleIds.length} déclinaison(s) désactivée(s) sur ${productId} : ` +
        `combinaison devenue invalide après changement d'axes.`,
    );
  }

  // --- Matrice ---

  /**
   * Produit cartésien des axes, dans l'ordre d'affichage.
   *
   * Le LIBELLÉ suit l'ordre des axes (« L / Rouge »), la SIGNATURE suit l'ordre
   * des identifiants. Les deux ordres sont volontairement différents : l'un est
   * lisible, l'autre est canonique, et confondre les deux ferait dépendre
   * l'unicité de l'ordre d'affichage choisi par l'admin.
   */
  private async combinations(clubId: string, productId: string) {
    const options = await this.prisma.shopProductOption.findMany({
      where: { clubId, productId },
      orderBy: { position: 'asc' },
      include: { values: { orderBy: { position: 'asc' } } },
    });
    const usable = options.filter((o) => o.values.length > 0);
    if (usable.length === 0) return [];

    let rows: Array<Array<{ id: string; value: string }>> = [[]];
    for (const option of usable) {
      const next: typeof rows = [];
      for (const row of rows) {
        for (const value of option.values) {
          next.push([...row, { id: value.id, value: value.value }]);
        }
      }
      rows = next;
    }

    return rows.map((row) => ({
      signature: optionSignature(row.map((v) => v.id)),
      label: row.map((v) => v.value).join(' / '),
    }));
  }

  /**
   * Engendre les combinaisons MANQUANTES. Idempotent.
   *
   * L'idempotence n'est pas tenue par une lecture préalable mais par le
   * `@@unique([productId, optionSignature])` : deux appels concurrents — un
   * double-clic suffit — passeraient tous deux la lecture, et c'est la base qui
   * arbitre. Le P2002 est donc un NO-OP attendu, pas une erreur à remonter.
   */
  async generateVariants(clubId: string, productId: string) {
    await this.assertProduct(clubId, productId);

    const combos = await this.combinations(clubId, productId);
    if (combos.length === 0) {
      throw new BadRequestException(
        'Définissez au moins un axe de déclinaison avant d’engendrer la matrice.',
      );
    }
    if (combos.length > MAX_MATRIX_SIZE) {
      throw new BadRequestException(
        `Cette matrice ferait ${combos.length} déclinaisons (maximum ${MAX_MATRIX_SIZE}).`,
      );
    }

    // Les réglages de stock sont HÉRITÉS de la variante par défaut. Sans cet
    // héritage, un produit vendu en illimité verrait sa matrice naître
    // `trackStock: true` avec zéro unité — donc entièrement invendable, sans
    // que rien ne le signale.
    const template = await this.prisma.shopProductVariant.findFirst({
      where: { clubId, productId, isDefault: true },
      select: {
        trackStock: true,
        reorderThreshold: true,
        reorderTargetQty: true,
      },
    });

    for (const combo of combos) {
      try {
        await this.prisma.shopProductVariant.create({
          data: {
            clubId,
            productId,
            optionSignature: combo.signature,
            isDefault: false,
            label: combo.label,
            sku: null,
            priceCents: null, // hérite du produit (ADR-0012 §6)
            trackStock: template?.trackStock ?? true,
            onHand: 0,
            available: 0,
            reorderThreshold: template?.reorderThreshold ?? null,
            reorderTargetQty: template?.reorderTargetQty ?? null,
          },
        });
      } catch (err: unknown) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          continue; // la combinaison existe déjà : c'est le cas nominal du rejeu
        }
        throw err;
      }
    }

    return this.shop.reloadProduct(clubId, productId);
  }

  // --- Variante ---

  /**
   * Met à jour les champs DESCRIPTIFS d'une variante.
   *
   * Ni `onHand` ni `available` ne figurent ici : toute écriture de stock passe
   * par `ShopStockService`, seul point d'écriture (ADR-0012). Les exposer sur
   * une mutation de mise à jour rouvrirait un second chemin de décrément, donc
   * une seconde garantie à tenir.
   */
  async updateVariant(
    clubId: string,
    variantId: string,
    input: UpdateVariantInput,
  ) {
    const data: Prisma.ShopProductVariantUpdateManyMutationInput = {};
    if (input.label !== undefined) data.label = input.label;
    if (input.sku !== undefined) data.sku = input.sku;
    if (input.priceCents !== undefined) data.priceCents = input.priceCents;
    if (input.active !== undefined) data.active = input.active;
    if (input.reorderTargetQty !== undefined) {
      data.reorderTargetQty = input.reorderTargetQty;
    }

    // RÉARMEMENT au changement de seuil (ADR-0012 §7). Sans lui, un seuil
    // relevé de 2 à 10 sur une variante déjà alertée n'alerterait plus JAMAIS :
    // le marqueur posé pour l'ancien seuil masquerait tous les passages
    // suivants, et le trésorier attendrait une alerte qui ne peut plus venir.
    if (input.reorderThreshold !== undefined) {
      data.reorderThreshold = input.reorderThreshold;
      data.lowStockAlertedAt = null;
    }
    // Idem à la (re)prise en charge du stock : la variante n'était pas suivie,
    // aucun marqueur ne veut plus rien dire.
    if (input.trackStock !== undefined) {
      data.trackStock = input.trackStock;
      data.lowStockAlertedAt = null;
    }

    // `updateMany` scopé par clubId, et non `update` par identifiant : la
    // frontière multi-tenant est portée par l'écriture elle-même, jamais par
    // une lecture préalable qu'on pourrait oublier de faire.
    const updated = await this.prisma.shopProductVariant.updateMany({
      where: { id: variantId, clubId },
      data,
    });
    if (updated.count !== 1) {
      throw new BadRequestException('Déclinaison introuvable.');
    }
    return this.reloadVariantProduct(clubId, variantId);
  }

  /**
   * Supprime une déclinaison créée par erreur.
   *
   * Jusqu'ici on ne pouvait que la RETIRER DE LA VENTE (`active: false`), et
   * elle restait dans la matrice pour toujours. C'est le bon modèle pour un
   * article qu'on a vendu et qu'on arrête, pas pour une taille saisie de
   * travers cinq minutes plus tôt.
   *
   * ⚠️ La suppression est refusée dès que la déclinaison a une HISTOIRE, et le
   * contrôle est ici, explicite, parce que la base ne le ferait pas : le lien
   * vers `ShopStockMovement` est en `onDelete: Cascade`. Supprimer sans
   * vérifier effacerait donc l'historique des entrées et sorties de stock
   * SANS un mot — une perte de données silencieuse dans une zone qui touche à
   * la comptabilité. Les lignes de commande, elles, sont en `Restrict` : la
   * base refuserait, mais avec une erreur illisible plutôt qu'une phrase.
   */
  async deleteVariant(clubId: string, variantId: string) {
    const variant = await this.prisma.shopProductVariant.findFirst({
      where: { id: variantId, clubId },
      select: { id: true, productId: true, isDefault: true, onHand: true },
    });
    if (!variant) {
      throw new BadRequestException('Déclinaison introuvable.');
    }
    if (variant.isDefault) {
      throw new BadRequestException(
        'La déclinaison par défaut ne se supprime pas : elle EST le produit. ' +
          'Pour revenir à un article sans taille, décoche « avec déclinaisons » ' +
          'dans Modifier.',
      );
    }

    const [movements, orderLines, purchaseLines, autresDuProduit] =
      await Promise.all([
        this.prisma.shopStockMovement.count({ where: { clubId, variantId } }),
        // `ShopOrderLine` ne porte pas de clubId : il se scope par sa
        // commande, qui en porte un.
        this.prisma.shopOrderLine.count({
          where: { variantId, order: { clubId } },
        }),
        this.prisma.shopPurchaseOrderLine.count({
          where: { clubId, variantId },
        }),
        this.prisma.shopProductVariant.count({
          where: {
            clubId,
            productId: variant.productId,
            isDefault: false,
            id: { not: variantId },
          },
        }),
      ]);

    if (orderLines > 0) {
      throw new BadRequestException(
        'Cette déclinaison a déjà été vendue : la supprimer effacerait la ' +
          'trace de ces ventes. Décoche « En vente » pour l’arrêter.',
      );
    }
    if (purchaseLines > 0) {
      throw new BadRequestException(
        'Cette déclinaison figure sur une commande fournisseur. Décoche ' +
          '« En vente » pour l’arrêter.',
      );
    }
    if (movements > 0) {
      throw new BadRequestException(
        'Cette déclinaison a un historique de stock, qui serait perdu. ' +
          'Décoche « En vente » pour l’arrêter.',
      );
    }
    if (variant.onHand !== 0) {
      throw new BadRequestException(
        `Il reste ${variant.onHand} article(s) en stock sur cette ` +
          'déclinaison. Sors-les du stock d’abord, sinon la marchandise ' +
          'disparaît des comptes sans être partie du placard.',
      );
    }
    if (autresDuProduit === 0) {
      throw new BadRequestException(
        'C’est la dernière déclinaison du produit : le supprimer ainsi ' +
          'rendrait l’article invendable en silence. Décoche « avec ' +
          'déclinaisons » dans Modifier, ce qui remet le produit en article ' +
          'simple.',
      );
    }

    // `deleteMany` scopé par clubId, comme les écritures voisines : la
    // frontière multi-tenant est portée par l'écriture, pas par la lecture
    // ci-dessus qu'on pourrait oublier de refaire un jour.
    const removed = await this.prisma.shopProductVariant.deleteMany({
      where: { id: variantId, clubId, isDefault: false },
    });
    if (removed.count !== 1) {
      throw new BadRequestException('Déclinaison introuvable.');
    }
    return this.shop.reloadProduct(clubId, variant.productId);
  }

  // --- Délégations au moteur de stock ---
  //
  // Ces trois méthodes ne réimplémentent RIEN : elles adaptent la signature
  // GraphQL à celle du moteur, puis rechargent le produit pour l'écran. Y
  // glisser le moindre calcul de compteur créerait le second chemin d'écriture
  // que l'ADR-0012 existe pour interdire.

  async restock(
    clubId: string,
    args: { variantId: string; qty: number; userId?: string | null; reason?: string | null },
  ) {
    await this.stock.restock({ clubId, ...args });
    return this.reloadVariantProduct(clubId, args.variantId);
  }

  async adjustStock(
    clubId: string,
    args: {
      variantId: string;
      countedOnHand: number;
      userId?: string | null;
      reason?: string | null;
    },
  ) {
    await this.stock.adjust({ clubId, ...args });
    return this.reloadVariantProduct(clubId, args.variantId);
  }

  async recordShrinkage(
    clubId: string,
    args: {
      variantId: string;
      qty: number;
      userId?: string | null;
      reason: string;
    },
  ) {
    await this.stock.recordShrinkage({ clubId, ...args });
    return this.reloadVariantProduct(clubId, args.variantId);
  }

  /** Le journal des mouvements, éventuellement filtré sur une variante. */
  async listMovements(
    clubId: string,
    args: { variantId?: string; take?: number; skip?: number },
  ) {
    return this.stock.listMovements(clubId, args);
  }

  /**
   * Les variantes sous leur seuil, tous produits confondus.
   *
   * Le filtre « sous le seuil » est appliqué en mémoire et non par la base :
   * comparer deux colonnes de la même ligne demanderait une référence de champ
   * Prisma, dont la sémantique face aux NULL est justement le piège que
   * l'ADR-0012 §2 cherche à éviter. Le `where` restreint déjà aux variantes
   * suivies et seuillées — quelques dizaines de lignes par club.
   */
  async listLowStock(clubId: string) {
    const rows = await this.prisma.shopProductVariant.findMany({
      where: {
        clubId,
        trackStock: true,
        active: true,
        reorderThreshold: { not: null },
        product: { active: true },
      },
      include: { product: { select: { id: true, name: true } } },
      orderBy: { available: 'asc' },
    });
    return rows
      .filter((v) => v.available <= v.reorderThreshold!)
      .map((v) => ({
        variantId: v.id,
        productId: v.product.id,
        productName: v.product.name,
        label: v.label,
        sku: v.sku,
        available: v.available,
        onHand: v.onHand,
        reorderThreshold: v.reorderThreshold!,
        reorderTargetQty: v.reorderTargetQty,
        alertedAt: v.lowStockAlertedAt,
      }));
  }

  // --- Utilitaires ---

  private async assertProduct(clubId: string, productId: string) {
    const found = await this.prisma.shopProduct.findFirst({
      where: { id: productId, clubId },
      select: { id: true },
    });
    if (!found) throw new BadRequestException('Produit introuvable.');
    return found;
  }

  private async reloadVariantProduct(clubId: string, variantId: string) {
    const variant = await this.prisma.shopProductVariant.findFirst({
      where: { id: variantId, clubId },
      select: { productId: true },
    });
    if (!variant) throw new BadRequestException('Déclinaison introuvable.');
    return this.shop.reloadProduct(clubId, variant.productId);
  }
}
