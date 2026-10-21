import { Field, type FieldMiddleware } from '@nestjs/graphql';
import { MediaUrlSignerService } from './media-url-signer.service';

/**
 * Le service est sans état — il ne lit que `process.env.JWT_SECRET` au
 * moment de signer. On l'instancie donc ici plutôt que de faire transiter
 * l'injection de dépendances jusque dans un middleware de champ, qui est
 * une simple fonction.
 */
const signer = new MediaUrlSignerService();

/**
 * Middleware de champ qui signe une URL média à la sortie GraphQL. Exporté
 * pour les champs NON nullables (`@Field({ middleware: [signMediaUrl] })`),
 * que `SignedPhotoField` — nullable — ne couvre pas : un justificatif
 * comptable a toujours un fichier.
 */
export const signMediaUrl: FieldMiddleware = async (_ctx, next) => {
  const value = (await next()) as unknown;
  if (typeof value !== 'string') return value;
  return signer.signUrl(value);
};

/**
 * Champ GraphQL exposant une photo d'adhérent.
 *
 * À utiliser À LA PLACE de `@Field(() => String, { nullable: true })` sur
 * tout `photoUrl`. La signature est posée ICI, à la frontière de sortie,
 * et non dans les ~20 endroits qui lisent la colonne : un service qui
 * oublierait de signer produirait un avatar cassé, et rien ne le dirait.
 *
 * Ce qui est signé n'est jamais ce qui est stocké — cf.
 * `MediaUrlSignerService`. Les data URI base64 et les URLs externes
 * traversent inchangées.
 */
export function SignedPhotoField(description?: string): PropertyDecorator {
  return Field(() => String, {
    nullable: true,
    description,
    middleware: [signMediaUrl],
  });
}
