import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeMemberEmail } from './member-email-family-rule';
import {
  MemberAccountCandidateGraph,
  MemberAccountLinkStateGraph,
} from './models/member-account-link.model';

/**
 * Rattachement fiche membre ↔ compte utilisateur.
 *
 * POURQUOI CE SERVICE EXISTE
 *
 * En production, le propriétaire du club s'est connecté au portail et est
 * tombé sur une fiche de démonstration. Son compte `User` était rattaché à une
 * vieille fiche « Compte Portail démo » ; sa VRAIE fiche portait le bon
 * e-mail mais AUCUN `userId`. L'index `@@unique([clubId, userId])` interdit
 * qu'un compte soit lié à deux fiches du même club : la place était prise, le
 * rattachement automatique par e-mail a échoué, et personne ne l'a su. La
 * correction a dû se faire en SQL sur la prod, faute d'écran.
 *
 * LA GARANTIE EST DANS LE `WHERE`
 *
 * `prisma db push` (ADR-0003) interdit tout CHECK et tout trigger. Le prédicat
 * d'un `updateMany` conditionnel dont on teste le `count` est donc le SEUL
 * mécanisme d'arbitrage disponible — même motif que `ShopStockService.reserve`
 * (ADR-0012) et que le correctif de `linkInvoice`. Aucun `findFirst` préalable
 * n'arbitre ici : une lecture rouvrirait le check-then-act qu'on ferme.
 *
 * Le `clubId` est DANS chaque écriture : la frontière multi-tenant est tenue
 * par la requête qui écrit, pas par une vérification en amont.
 */
@Injectable()
export class MemberAccountLinkService {
  private readonly log = new Logger(MemberAccountLinkService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** État courant du rattachement d'une fiche. */
  async getLinkState(
    clubId: string,
    memberId: string,
  ): Promise<MemberAccountLinkStateGraph> {
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, clubId },
      select: {
        id: true,
        userId: true,
        user: { select: { email: true, displayName: true } },
      },
    });
    if (!member) throw new NotFoundException('Membre introuvable');
    return {
      memberId: member.id,
      userId: member.userId,
      userEmail: member.user?.email ?? null,
      userDisplayName: member.user?.displayName ?? null,
    };
  }

  /**
   * Comptes proposables pour cette fiche, AVEC leur détenteur actuel.
   *
   * Le périmètre est volontairement restreint aux comptes déjà en relation
   * avec le club (membre, contact, ou membership back-office) — plus tout
   * compte dont l'e-mail est exactement celui de la fiche, qui est LE cas de
   * l'incident : la vraie fiche portait le bon e-mail sans le compte.
   */
  async listCandidates(
    clubId: string,
    memberId: string,
    search?: string | null,
  ): Promise<MemberAccountCandidateGraph[]> {
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, clubId },
      select: { id: true, email: true },
    });
    if (!member) throw new NotFoundException('Membre introuvable');
    const memberEmail = normalizeMemberEmail(member.email);

    const q = (search ?? '').trim();
    const users = await this.prisma.user.findMany({
      where: {
        AND: [
          {
            OR: [
              { members: { some: { clubId } } },
              { contacts: { some: { clubId } } },
              { memberships: { some: { clubId } } },
              ...(memberEmail ? [{ email: memberEmail }] : []),
            ],
          },
          ...(q
            ? [
                {
                  OR: [
                    { email: { contains: q, mode: 'insensitive' as const } },
                    {
                      displayName: {
                        contains: q,
                        mode: 'insensitive' as const,
                      },
                    },
                  ],
                },
              ]
            : []),
        ],
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        // Détenteur DANS CE CLUB uniquement : l'unicité est par club, un
        // compte lié à une fiche d'un autre club n'est pas un conflit ici.
        members: {
          where: { clubId },
          select: { id: true, firstName: true, lastName: true },
          take: 1,
        },
      },
      orderBy: [{ email: 'asc' }],
      take: 50,
    });

    return users.map((u) => {
      const holder = u.members[0];
      return {
        userId: u.id,
        email: u.email,
        displayName: u.displayName,
        heldByMemberId: holder?.id ?? null,
        heldByMemberName: holder
          ? `${holder.firstName} ${holder.lastName}`.trim()
          : null,
        emailMatchesMember:
          memberEmail !== '' && normalizeMemberEmail(u.email) === memberEmail,
      };
    });
  }

  /**
   * Rattache `userId` à `memberId`.
   *
   * DÉPLACEMENT EXPLICITE — POURQUOI UN DRAPEAU PLUTÔT QU'UNE ERREUR SÈCHE
   *
   * L'incident de production a une double nature : il fallait à la fois
   * DÉTACHER la fiche démo et RATTACHER la vraie. Refuser sèchement forcerait
   * l'admin à enchaîner deux gestes sur deux fiches différentes, dont l'un
   * (détacher la fiche démo) laisse transitoirement le propriétaire sans
   * aucun accès au portail — exactement l'état qu'on veut éviter. Le drapeau
   * `confirmMove` permet de faire le déplacement d'un seul geste ATOMIQUE,
   * tout en interdisant le vol silencieux : SANS le drapeau, l'opération
   * échoue et nomme la fiche en conflit.
   *
   * Le cas symétrique — la FICHE détient déjà un AUTRE compte — n'exige pas
   * de drapeau : cet état est affiché en toutes lettres sur l'écran que
   * l'admin est en train de regarder, il ne peut pas le remplacer sans le
   * voir. Le conflit invisible, celui qui a mordu en prod, est l'autre.
   *
   * ORDRE IMPOSÉ : détacher PUIS attacher, dans la MÊME transaction.
   * L'inverse violerait `@@unique([clubId, userId])` — deux fiches
   * porteraient le même compte le temps d'une instruction. Et hors
   * transaction, une panne entre les deux laisserait le compte rattaché à
   * AUCUNE fiche : le propriétaire perdrait son accès au lieu d'en changer.
   */
  async link(
    clubId: string,
    input: { memberId: string; userId: string; confirmMove?: boolean | null },
  ): Promise<void> {
    const { memberId, userId } = input;

    await this.prisma.$transaction(async (tx) => {
      // Lecture DIAGNOSTIQUE, jamais arbitrale : elle ne sert qu'à NOMMER la
      // fiche dans le message d'erreur. L'arbitrage est `detached.count`
      // ci-dessous — si cette lecture rate ou renvoie null, le refus tombe
      // quand même (c'est testé).
      const holder = await tx.member.findFirst({
        where: { clubId, userId, id: { not: memberId } },
        select: { id: true, firstName: true, lastName: true },
      });

      // 1) DÉTACHER le détenteur actuel. `clubId` dans le WHERE : on ne
      //    détache jamais une fiche d'un autre club.
      const detached = await tx.member.updateMany({
        where: { clubId, userId, id: { not: memberId } },
        data: { userId: null },
      });

      // Le refus du vol silencieux est décidé par le COMPTE de lignes que
      // l'écriture a réellement touchées, et le throw annule la transaction :
      // rien n'est détaché si le déplacement n'est pas confirmé.
      if (detached.count > 0 && input.confirmMove !== true) {
        const nom = holder
          ? `« ${`${holder.firstName} ${holder.lastName}`.trim()} »`
          : 'une autre fiche du club';
        throw new ConflictException(
          `Ce compte est déjà rattaché à ${nom}. Rattacher ici DÉPLACERAIT le lien : confirmez le déplacement pour continuer.`,
        );
      }

      // 2) ATTACHER. `clubId` dans le WHERE, encore : c'est cette requête —
      //    pas un contrôle en amont — qui tient la frontière multi-tenant.
      let attached: { count: number };
      try {
        attached = await tx.member.updateMany({
          where: { id: memberId, clubId },
          data: { userId },
        });
      } catch (e) {
        // FK : le compte n'existe pas. C'est la base qui arbitre, pas une
        // lecture préalable.
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          (e.code === 'P2003' || e.code === 'P2025')
        ) {
          throw new BadRequestException('Compte utilisateur introuvable.');
        }
        throw e;
      }
      if (attached.count !== 1) {
        throw new NotFoundException('Membre introuvable');
      }

      if (detached.count > 0) {
        this.log.warn(
          `[member-account-link] Lien DÉPLACÉ (club ${clubId}) : compte ${userId} retiré de la fiche ${holder?.id ?? '?'} et rattaché à la fiche ${memberId}.`,
        );
      }
    });
  }

  /**
   * Détache la fiche de tout compte.
   *
   * Tout le prédicat est dans le WHERE — club, fiche, et « a bien un lien » :
   * `count !== 1` distingue donc l'absence de fiche d'un détachement à vide.
   */
  async unlink(clubId: string, memberId: string): Promise<void> {
    const unlinked = await this.prisma.member.updateMany({
      where: { id: memberId, clubId, userId: { not: null } },
      data: { userId: null },
    });
    if (unlinked.count !== 1) {
      throw new NotFoundException(
        'Fiche introuvable, ou déjà rattachée à aucun compte.',
      );
    }
  }
}
