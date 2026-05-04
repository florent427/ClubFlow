import { Field, InputType } from '@nestjs/graphql';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Input pour la mutation `requestVitrineDomain` : déclare le FQDN custom
 * que le club veut utiliser pour sa vitrine. Met le statut à PENDING_DNS
 * en attendant la propagation DNS et la vérif Caddy.
 */
@InputType()
export class SetVitrineDomainInput {
  /** FQDN du domaine vitrine (ex. `monclub.fr`, `karate.exemple.fr`). */
  @Field()
  @IsString()
  @MinLength(4)
  @MaxLength(253)
  @Matches(/^[a-z0-9]([a-z0-9-.]*[a-z0-9])?$/, {
    message: 'domain doit être un FQDN valide en minuscules.',
  })
  domain!: string;
}
