import type { PrismaService } from '../prisma/prisma.service';
import { FamilyMemberLinkRole, MemberStatus } from '@prisma/client';
import { normalizeMemberEmail } from './member-email-family-rule';

/**
 * Résout la liste des destinataires e-mail pour un mail concernant un
 * Member donné :
 *
 *   1. L'e-mail du Member lui-même (s'il en a renseigné un — il peut
 *      être différent de celui de ses parents).
 *   2. Les e-mails des **payeurs** du foyer du Member (FamilyMember
 *      avec linkRole = PAYER, qu'ils soient Member ou Contact). Ainsi
 *      les parents reçoivent toujours les communications concernant
 *      leur enfant, même si l'enfant a une adresse perso.
 *
 * Déduplique les adresses (case-insensitive). Retourne un tableau de
 * strings prêtes à passer dans `MailTransport.sendEmail({ to: ... })`.
 *
 * Si aucun destinataire (member sans e-mail, foyer sans payeur), retourne
 * un tableau vide — il appartient à l'appelant de décider quoi faire
 * (typiquement : log + skip).
 */
export async function resolveMemberMailRecipients(
  prisma: Pick<PrismaService, 'member' | 'familyMember'>,
  memberId: string,
): Promise<string[]> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { email: true, status: true },
  });
  if (!member || member.status !== MemberStatus.ACTIVE) {
    return [];
  }
  const set = new Set<string>();
  if (member.email) {
    const norm = normalizeMemberEmail(member.email);
    if (norm) set.add(norm);
  }
  // Foyer du Member → tous les FamilyMember PAYER (Member + Contact)
  const myFamilyLinks = await prisma.familyMember.findMany({
    where: { memberId },
    select: { familyId: true },
  });
  if (myFamilyLinks.length === 0) {
    return [...set];
  }
  const familyIds = myFamilyLinks.map((l) => l.familyId);
  const payerLinks = await prisma.familyMember.findMany({
    where: {
      familyId: { in: familyIds },
      linkRole: FamilyMemberLinkRole.PAYER,
    },
    select: {
      member: { select: { email: true, status: true } },
      contact: { select: { user: { select: { email: true } } } },
    },
  });
  for (const link of payerLinks) {
    const memberEmail = link.member?.email ?? null;
    if (memberEmail && link.member?.status === MemberStatus.ACTIVE) {
      const norm = normalizeMemberEmail(memberEmail);
      if (norm) set.add(norm);
    }
    const contactEmail = link.contact?.user?.email ?? null;
    if (contactEmail) {
      const norm = normalizeMemberEmail(contactEmail);
      if (norm) set.add(norm);
    }
  }
  return [...set];
}
