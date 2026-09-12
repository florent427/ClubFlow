import { Field, ID, InputType } from '@nestjs/graphql';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

import { ACCOUNT_LABEL_MAX_LENGTH } from '../accounting-mapping.service';

/**
 * Renommage d'un compte du plan comptable. Le code PCG n'est volontairement
 * pas modifiable : il sert de clé à tout le reste de la comptabilité.
 */
@InputType()
export class RenameClubAccountingAccountInput {
  @Field(() => ID)
  @IsUUID()
  accountingAccountId!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(ACCOUNT_LABEL_MAX_LENGTH)
  label!: string;
}
