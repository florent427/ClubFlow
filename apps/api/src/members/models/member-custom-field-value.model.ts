import { Field, ID, ObjectType } from '@nestjs/graphql';
import { MemberCustomFieldDefinitionGraph } from './member-custom-field-definition.model';

@ObjectType()
export class MemberCustomFieldValueGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  definitionId!: string;

  @Field(() => String, { nullable: true })
  valueText!: string | null;

  @Field(() => MemberCustomFieldDefinitionGraph)
  definition!: MemberCustomFieldDefinitionGraph;
}
