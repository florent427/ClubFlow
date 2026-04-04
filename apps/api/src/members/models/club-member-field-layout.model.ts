import { Field, ObjectType } from '@nestjs/graphql';
import { MemberCatalogFieldSettingGraph } from './member-catalog-field-setting.model';
import { MemberCustomFieldDefinitionGraph } from './member-custom-field-definition.model';

@ObjectType()
export class ClubMemberFieldLayoutGraph {
  @Field(() => [MemberCatalogFieldSettingGraph])
  catalogSettings!: MemberCatalogFieldSettingGraph[];

  @Field(() => [MemberCustomFieldDefinitionGraph])
  customFieldDefinitions!: MemberCustomFieldDefinitionGraph[];
}
