import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { ClubPaymentMethod } from '@prisma/client';

/**
 * Résultat de `viewerLockInvoicePaymentChoice` : confirmation du choix
 * du payeur (méthode + échéancier) + texte d'instructions à afficher.
 *
 * Le STRIPE_CARD est traité séparément via `viewerCreateInvoiceCheckoutSession`
 * (qui retourne une URL Stripe). Cette ObjectType cible donc les
 * paiements manuels (espèces / chèque / virement).
 */
@ObjectType('ViewerInvoicePaymentChoice')
export class ViewerInvoicePaymentChoiceGraph {
  @Field(() => ID)
  invoiceId!: string;

  @Field(() => ClubPaymentMethod)
  method!: ClubPaymentMethod;

  /** 1 = comptant, 3 = en 3 versements. */
  @Field(() => Int)
  installmentsCount!: number;

  /**
   * Texte d'instructions à afficher au payeur après son choix
   * (montant, libellé, modalités). Localisé en français.
   */
  @Field(() => String)
  instructions!: string;
}
