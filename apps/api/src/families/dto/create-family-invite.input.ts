import { Field, InputType } from '@nestjs/graphql';
import { FamilyInviteRole } from '@prisma/client';
import { IsEnum } from 'class-validator';

@InputType()
export class CreateFamilyInviteInput {
  @Field(() => FamilyInviteRole, {
    description:
      'COPAYER : crée un foyer résidence lié à l’espace partagé. VIEWER : rejoint directement le foyer du payeur (lecture seule).',
  })
  @IsEnum(FamilyInviteRole)
  role!: FamilyInviteRole;
}
