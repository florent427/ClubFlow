import { Field, InputType } from '@nestjs/graphql';
import { MembershipRole } from '@prisma/client';
import { IsEmail, IsEnum } from 'class-validator';

/**
 * Octroi d'un accès back-office à un compte ClubFlow EXISTANT, par e-mail.
 *
 * Tous les champs portent un décorateur class-validator : le ValidationPipe
 * global tourne en `whitelist` + `forbidNonWhitelisted`, un champ nu serait
 * REJETÉ (cf. `common/dto-validation-whitelist.spec.ts`).
 */
@InputType()
export class InviteClubTeamMemberInput {
  @Field(() => String, {
    description:
      'E-mail d’un compte ClubFlow existant. Si aucun compte ne correspond, ' +
      'la mutation échoue en le disant — elle ne crée pas de compte.',
  })
  @IsEmail()
  email!: string;

  @Field(() => MembershipRole)
  @IsEnum(MembershipRole)
  role!: MembershipRole;
}
