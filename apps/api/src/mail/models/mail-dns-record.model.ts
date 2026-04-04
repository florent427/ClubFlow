import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class MailDnsRecordGraph {
  @Field()
  type!: string;

  @Field()
  name!: string;

  @Field()
  value!: string;

  @Field(() => Int, { nullable: true })
  ttl!: number | null;

  @Field(() => Int, { nullable: true })
  priority!: number | null;
}
