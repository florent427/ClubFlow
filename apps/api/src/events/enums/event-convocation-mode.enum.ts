import { registerEnumType } from '@nestjs/graphql';

/**
 * Public selector for an event convocation e-mail audience.
 *   - REGISTERED    : uniquement les inscrits (status != CANCELLED)
 *   - ALL_MEMBERS   : tous les adhérents actifs du club (diffusion)
 *   - DYNAMIC_GROUP : membres ACTIFS matchant un groupe dynamique (id requis)
 */
export enum EventConvocationMode {
  REGISTERED = 'REGISTERED',
  ALL_MEMBERS = 'ALL_MEMBERS',
  DYNAMIC_GROUP = 'DYNAMIC_GROUP',
}

registerEnumType(EventConvocationMode, {
  name: 'EventConvocationMode',
  description:
    'Sélecteur d’audience pour l’envoi d’une convocation d’événement par e-mail.',
});
