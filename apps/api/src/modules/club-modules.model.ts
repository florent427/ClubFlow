import { Field, ObjectType } from '@nestjs/graphql';
import { ModuleCode } from '../domain/module-registry/module-codes';

@ObjectType()
export class ClubModuleGraph {
  @Field()
  id!: string;

  @Field()
  clubId!: string;

  @Field(() => ModuleCode)
  moduleCode!: ModuleCode;

  @Field()
  enabled!: boolean;
}
