import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

/** Régler une facture avec le crédit d'une personne (ADR-0022, §3). */
@InputType()
export class ApplyPayerCreditInput {
  @Field(() => ID)
  @IsUUID()
  invoiceId!: string;

  @Field(() => ID, {
    nullable: true,
    description: 'Personne dont le crédit règle la facture : un membre OU un contact.',
  })
  @IsOptional()
  @IsUUID()
  memberId?: string | null;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  contactId?: string | null;

  @Field(() => Int, {
    nullable: true,
    description:
      'Montant imputé. Par défaut : le plus petit du crédit disponible et du reste à encaisser.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  amountCents?: number | null;
}
