import { Field, ID, InputType, registerEnumType } from '@nestjs/graphql';
import { IsEnum, IsUUID } from 'class-validator';

/** Comment la commande part chez le fournisseur (ADR-0021 §5). */
export enum ShopPurchaseOrderSendMode {
  /** La commande passe « envoyée », PUIS le bon de commande part par e-mail. */
  EMAIL = 'EMAIL',
  /** La transition seule : commande passée par téléphone ou sur le portail du fournisseur. */
  MARK_ONLY = 'MARK_ONLY',
}

registerEnumType(ShopPurchaseOrderSendMode, {
  name: 'ShopPurchaseOrderSendMode',
  description:
    'EMAIL : la commande passe « envoyée », puis le bon de commande part par e-mail au fournisseur. MARK_ONLY : la transition seule.',
});

/**
 * TOUT champ porte un décorateur class-validator : le ValidationPipe global
 * tourne en `whitelist` + `forbidNonWhitelisted`.
 */
@InputType()
export class SendShopPurchaseOrderInput {
  @Field(() => ID)
  @IsUUID()
  orderId!: string;

  @Field(() => ShopPurchaseOrderSendMode)
  @IsEnum(ShopPurchaseOrderSendMode)
  mode!: ShopPurchaseOrderSendMode;
}
