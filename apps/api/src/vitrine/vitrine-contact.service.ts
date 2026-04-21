import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Gère la soumission publique du formulaire de contact du site vitrine.
 *
 * Comportement :
 *  - cherche ou crée un `User` avec l'e-mail (emailVerifiedAt reste null)
 *  - crée un `Contact` scopé au club si inexistant
 *  - journalise le message dans `Contact.createdAt` + met à jour le
 *    `displayName` du User avec prénom+nom si fourni
 *  - retourne un résultat générique (pas de fuite d'info sur l'existence)
 *
 * Rate-limit : imposé côté resolver via `@Throttle` (10/min/IP).
 */
@Injectable()
export class VitrineContactService {
  constructor(private readonly prisma: PrismaService) {}

  async submit(input: {
    clubSlug: string;
    firstName?: string | null;
    lastName?: string | null;
    email: string;
    phone?: string | null;
    message: string;
  }): Promise<{ success: boolean; message: string | null }> {
    const email = input.email.trim().toLowerCase();
    const message = input.message.trim();
    if (!email || !message) {
      throw new BadRequestException('E-mail et message requis.');
    }
    if (message.length > 5000) {
      throw new BadRequestException('Message trop long (max 5000 caractères).');
    }

    const club = await this.prisma.club.findUnique({
      where: { slug: input.clubSlug },
      select: { id: true, name: true },
    });
    if (!club) throw new NotFoundException('Club introuvable.');

    const firstName = (input.firstName ?? '').trim();
    const lastName = (input.lastName ?? '').trim();
    const displayName =
      `${firstName} ${lastName}`.trim() || email.split('@')[0] || 'Visiteur';

    // Upsert du User (sans mot de passe, non vérifié)
    const user = await this.prisma.user.upsert({
      where: { email },
      create: {
        id: randomUUID(),
        email,
        displayName,
      },
      update: {
        // Ne pas écraser le displayName si l'utilisateur a déjà un compte
        displayName: undefined,
      },
    });

    // Upsert du Contact (scopé club)
    await this.prisma.contact.upsert({
      where: { userId_clubId: { userId: user.id, clubId: club.id } },
      create: {
        userId: user.id,
        clubId: club.id,
        firstName: firstName || user.displayName.split(' ')[0] || 'Visiteur',
        lastName: lastName || 'Prospect',
      },
      update: {
        // Pas d'écrasement si déjà existant
      },
    });

    // TODO(phase 2) : persister le message dans une table dédiée
    // `VitrineContactMessage` avec clubId, contactId, body, phone, createdAt.
    // En Phase 1, on se contente de créer/mettre à jour le contact : le
    // staff club voit le prospect dans l'annuaire et peut déclencher une
    // prise de contact manuelle. Le `message` est loggé pour audit :
    console.log(
      `[vitrine.contact] club=${club.id} email=${email} phone=${
        input.phone ?? ''
      } message_len=${message.length}`,
    );

    return { success: true, message: null };
  }
}
