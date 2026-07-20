import { Field, ID, InputType } from '@nestjs/graphql';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

/**
 * Rattachement d'une fiche membre à un compte `User`.
 *
 * Tous les champs portent un décorateur class-validator : le ValidationPipe
 * global tourne en `whitelist` + `forbidNonWhitelisted`, un champ nu serait
 * REJETÉ (cf. `common/dto-validation-whitelist.spec.ts`).
 */
@InputType()
export class LinkMemberAccountInput {
  @Field(() => ID)
  @IsUUID('4')
  memberId!: string;

  @Field(() => ID)
  @IsUUID('4')
  userId!: string;

  @Field(() => Boolean, {
    nullable: true,
    description:
      'Obligatoire (true) si le compte est DÉJÀ rattaché à une autre fiche du club : ' +
      'le rattachement DÉPLACE alors le lien, il ne l’ajoute pas.',
  })
  @IsOptional()
  @IsBoolean()
  confirmMove?: boolean;
}
