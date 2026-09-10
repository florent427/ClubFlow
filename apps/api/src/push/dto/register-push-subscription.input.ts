import { Field, InputType } from '@nestjs/graphql';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

/**
 * Abonnement tel que le navigateur le renvoie (`PushSubscription.toJSON()`),
 * aplati : endpoint + les deux clés de chiffrement du payload.
 */
@InputType()
export class RegisterPushSubscriptionInput {
  @Field()
  @IsString()
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: false })
  @MaxLength(2048)
  endpoint!: string;

  @Field()
  @IsString()
  @MaxLength(512)
  p256dh!: string;

  @Field()
  @IsString()
  @MaxLength(256)
  auth!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  userAgent?: string | null;
}
