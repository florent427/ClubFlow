import { Field, ID, ObjectType } from '@nestjs/graphql';
import { MemberCatalogFieldKey } from '@prisma/client';

@ObjectType()
export class MemberCatalogFieldSettingGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  clubId!: string;

  @Field(() => MemberCatalogFieldKey)
  fieldKey!: MemberCatalogFieldKey;

  @Field()
  showOnForm!: boolean;

  @Field()
  required!: boolean;

  @Field()
  sortOrder!: number;
}
