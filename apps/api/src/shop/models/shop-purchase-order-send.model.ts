import { Field, ObjectType } from '@nestjs/graphql';
import { ShopPurchaseOrderGraph } from './shop-purchase.model';

/**
 * L'envoi d'une commande au fournisseur (ADR-0021 §5). Dès que ce résultat
 * existe, la commande est partie — l'encours la compte. `emailError` dit si le
 * bon de commande, lui, a suivi : un échec d'e-mail ne défait pas l'envoi, et
 * lever aurait fait croire l'inverse.
 */
@ObjectType()
export class ShopPurchaseOrderSendResultGraph {
  @Field(() => ShopPurchaseOrderGraph)
  order!: ShopPurchaseOrderGraph;

  /** Null : bon parti, ou rien à envoyer (MARK_ONLY). Sinon, le message à montrer. */
  @Field(() => String, { nullable: true })
  emailError!: string | null;
}
