import { Field, ID, ObjectType } from '@nestjs/graphql';
import { MemberCustomFieldType } from '@prisma/client';

@ObjectType()
export class MemberCustomFieldDefinitionGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  clubId!: string;

  @Field()
  code!: string;

  @Field()
  label!: string;

  @Field(() => MemberCustomFieldType)
  type!: MemberCustomFieldType;

  @Field()
  required!: boolean;

  @Field()
  sortOrder!: number;

  @Field({
    description: 'Si vrai, prévu pour affichage / édition côté adhérent (portail)',
  })
  visibleToMember!: boolean;

  @Field(() => String, {
    nullable: true,
    description: 'JSON : tableau de chaînes pour le type SELECT',
  })
  optionsJson!: string | null;
}
