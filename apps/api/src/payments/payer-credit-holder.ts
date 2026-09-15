import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/** Personne désignée par l'appelant : un membre OU un contact. */
export type PayerCreditHolderRef = {
  memberId?: string | null;
  contactId?: string | null;
};

/**
 * La personne à qui appartient un crédit (ADR-0022, §1).
 */
export type PayerCreditHolder = {
  /** Profil désigné par l'appelant : exactement un des deux est renseigné. */
  memberId: string | null;
  contactId: string | null;
  displayName: string;
  /**
   * Tous les profils de la MÊME personne dans le club : le membre et le
   * contact rattachés au même compte utilisateur. Le crédit de l'un est celui
   * de l'autre, si bien qu'un contact promu membre garde le sien.
   */
  memberIds: string[];
  contactIds: string[];
};

type Db = Pick<Prisma.TransactionClient, 'member' | 'contact'>;

/**
 * Résout la personne créditée et ses profils. Exactement un identifiant, et du
 * club : un identifiant d'un autre club est introuvable, jamais accepté.
 */
export async function resolvePayerCreditHolder(
  db: Db,
  clubId: string,
  ref: PayerCreditHolderRef,
): Promise<PayerCreditHolder> {
  const memberId = ref.memberId?.trim() || null;
  const contactId = ref.contactId?.trim() || null;
  if (!memberId === !contactId) {
    throw new BadRequestException(
      'Désignez exactement une personne : un membre ou un contact.',
    );
  }

  if (memberId) {
    const member = await db.member.findFirst({
      where: { id: memberId, clubId },
      select: { id: true, userId: true, firstName: true, lastName: true },
    });
    if (!member) {
      throw new NotFoundException('Membre introuvable pour ce club.');
    }
    // Sans compte utilisateur, le membre n'a pas d'autre profil.
    const contacts = member.userId
      ? await db.contact.findMany({
          where: { clubId, userId: member.userId },
          select: { id: true },
        })
      : [];
    return {
      memberId: member.id,
      contactId: null,
      displayName: `${member.firstName} ${member.lastName}`.trim(),
      memberIds: [member.id],
      contactIds: contacts.map((c) => c.id),
    };
  }

  const contact = await db.contact.findFirst({
    where: { id: contactId as string, clubId },
    select: { id: true, userId: true, firstName: true, lastName: true },
  });
  if (!contact) {
    throw new NotFoundException('Contact introuvable pour ce club.');
  }
  // Un compte utilisateur n'a qu'une fiche membre par club.
  const member = await db.member.findFirst({
    where: { clubId, userId: contact.userId },
    select: { id: true },
  });
  return {
    memberId: null,
    contactId: contact.id,
    displayName: `${contact.firstName} ${contact.lastName}`.trim(),
    memberIds: member ? [member.id] : [],
    contactIds: [contact.id],
  };
}
