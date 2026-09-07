import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { TransactionalMailService } from '../mail/transactional-mail.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Gère la soumission publique du formulaire de contact du site vitrine.
 *
 * Comportement :
 *  - cherche ou crée un `User` avec l'e-mail (emailVerifiedAt reste null)
 *  - crée un `Contact` scopé au club si inexistant (téléphone inclus)
 *  - transmet le message par e-mail à `Club.contactEmail`, Reply-To sur
 *    l'adresse du visiteur
 *  - retourne un résultat générique (pas de fuite d'info sur l'existence)
 *
 * Ordre volontaire : le prospect est écrit AVANT l'envoi. Un échec SMTP ne
 * doit pas faire perdre la fiche, et le visiteur qui réessaie retombe sur
 * des upserts idempotents.
 *
 * Rate-limit : imposé côté resolver via `@Throttle` (10/min/IP).
 */
@Injectable()
export class VitrineContactService {
  private readonly log = new Logger(VitrineContactService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: TransactionalMailService,
  ) {}

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
      select: { id: true, name: true, contactEmail: true },
    });
    if (!club) throw new NotFoundException('Club introuvable.');

    const firstName = (input.firstName ?? '').trim();
    const lastName = (input.lastName ?? '').trim();
    const phone = input.phone?.trim() || null;
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
        phone,
      },
      update: {
        // Pas d'écrasement si déjà existant
      },
    });

    if (!club.contactEmail) {
      // Explicite à dessein : sans adresse de contact, le message du visiteur
      // n'est transmis nulle part. Seule la fiche prospect reste visible dans
      // l'annuaire du club.
      this.log.warn(
        `[vitrine.contact] club=${club.id} : message de ${email} reçu mais ` +
          `aucun e-mail de contact configuré — le bureau n'est pas averti ` +
          `(prospect créé seulement).`,
      );
      return { success: true, message: null };
    }

    try {
      await this.mail.sendVitrineContactMessage(club.id, club.contactEmail, {
        clubName: club.name,
        visitorName: `${firstName} ${lastName}`.trim(),
        visitorEmail: email,
        visitorPhone: phone,
        message,
      });
    } catch (err) {
      // Le prospect est déjà écrit ; on le dit au visiteur pour qu'il
      // réessaie plutôt que de croire son message parti.
      this.log.error(
        `[vitrine.contact] message NON TRANSMIS club=${club.id} from=${email} ` +
          `to=${club.contactEmail} : ${(err as Error).message}`,
      );
      return {
        success: false,
        message:
          'Votre message n’a pas pu être transmis. Réessayez dans quelques minutes.',
      };
    }

    this.log.log(
      `[vitrine.contact] transmis club=${club.id} from=${email} ` +
        `to=${club.contactEmail} message_len=${message.length}`,
    );
    return { success: true, message: null };
  }
}
