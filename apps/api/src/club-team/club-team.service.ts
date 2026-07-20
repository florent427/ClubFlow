import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MembershipRole, Prisma, SystemRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClubTeamMemberGraph } from './models/club-team-member.model';

/**
 * Équipe back-office d'un club : qui a accès à l'espace d'administration.
 *
 * POURQUOI CE SERVICE EXISTE
 *
 * Jusqu'ici, AUCUNE mutation du dépôt n'accordait ni ne retirait un
 * `ClubMembership`. En production : 7 lignes, exactement UN `CLUB_ADMIN` par
 * club — son créateur — et aucun second administrateur nulle part. Un club
 * dont l'unique admin perd son accès n'avait d'autre recours qu'un `UPDATE`
 * manuel sur la base de production.
 *
 * LES DEUX GARDE-FOUS
 *
 * Ils mènent tous deux au même état irrécupérable — le club ORPHELIN, sans
 * plus aucun administrateur :
 *
 *   1. on ne retire ni ne rétrograde le DERNIER administrateur ;
 *   2. on n'agit jamais sur SON PROPRE accès.
 *
 * LA GARANTIE EST DANS LE `WHERE`
 *
 * `prisma db push` (ADR-0003) interdit tout CHECK et tout trigger. Le prédicat
 * d'un `deleteMany` / `updateMany` conditionnel dont on teste le `count` est
 * donc le SEUL mécanisme d'arbitrage disponible — même motif que
 * `ShopStockService.reserve` (ADR-0012) et que `MemberAccountLinkService`.
 *
 * Les deux garde-fous sont dans ce prédicat, pas dans un `if` :
 *
 *   - « pas soi-même »        →  `userId: { not: actorUserId }`
 *   - « pas le dernier admin » →  `OR[ role ≠ CLUB_ADMIN,
 *                                     il existe un AUTRE CLUB_ADMIN ]`
 *
 * Le second se traduit en un `EXISTS (SELECT 1 FROM "ClubMembership" …)`
 * porté par la MÊME instruction que la suppression.
 *
 * POURQUOI UN VERROU EN PLUS — ET CE QU'IL N'EST PAS
 *
 * Un `EXISTS` corrélé ne suffit PAS à lui seul à fermer la course. Sous
 * READ COMMITTED, PostgreSQL reverrouille et réévalue le prédicat sur la
 * LIGNE CIBLE, mais pas sur les lignes lues par la sous-requête : deux
 * retraits concurrents visant DEUX admins différents verraient chacun
 * « il en reste un autre » et laisseraient zéro. C'est un write-skew
 * classique, et aucune formulation de `WHERE` ne le corrige.
 *
 * D'où `pg_advisory_xact_lock` sur le couple (club-team, clubId) : il
 * sérialise les écritures d'équipe D'UN MÊME CLUB, et rien d'autre. Ce
 * verrou n'ARBITRE rien — il ne lit ni ne compte : il garantit seulement que
 * l'`EXISTS` du prédicat est évalué sur un état que personne ne modifie en
 * parallèle. L'arbitre reste le `count` de l'écriture.
 *
 * Le `clubId` est DANS chaque écriture : la frontière multi-tenant est tenue
 * par la requête qui écrit, pas par une vérification en amont.
 */
@Injectable()
export class ClubTeamService {
  private readonly log = new Logger(ClubTeamService.name);

  constructor(private readonly prisma: PrismaService) {}

  // -----------------------------------------------------------------
  // Lecture
  // -----------------------------------------------------------------

  /** Les accès back-office du club, l'administrateur d'abord. */
  async list(
    clubId: string,
    actorUserId: string,
  ): Promise<ClubTeamMemberGraph[]> {
    const rows = await this.prisma.clubMembership.findMany({
      where: { clubId },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        userId: true,
        role: true,
        createdAt: true,
        user: { select: { email: true, displayName: true } },
      },
    });

    const admins = rows.filter((r) => r.role === MembershipRole.CLUB_ADMIN);
    const seulAdminId = admins.length === 1 ? admins[0]!.id : null;

    return rows.map((r) => ({
      membershipId: r.id,
      userId: r.userId,
      email: r.user?.email ?? '',
      displayName: r.user?.displayName ?? '',
      role: r.role,
      createdAt: r.createdAt,
      isSelf: r.userId === actorUserId,
      isLastAdmin: r.id === seulAdminId,
    }));
  }

  // -----------------------------------------------------------------
  // Écritures
  // -----------------------------------------------------------------

  /**
   * Accorde un accès back-office à un compte ClubFlow EXISTANT, par e-mail.
   *
   * POURQUOI UN COMPTE EXISTANT PLUTÔT QU'UNE CRÉATION À LA VOLÉE
   *
   *  - créer un compte depuis cet écran ferait de tout administrateur de club
   *    un émetteur de comptes de plateforme : un `User` est une identité
   *    GLOBALE, partagée par tous les clubs. Le rayon d'action d'un
   *    administrateur de club doit s'arrêter à son club ;
   *  - le dépôt a déjà un chemin de création de compte (`MemberAccountActivationService`,
   *    invitation depuis la fiche adhérent) avec vérification d'e-mail. En
   *    doubler un ici créerait un second chemin, non vérifié ;
   *  - un e-mail mal tapé créerait alors un compte fantôme portant les droits
   *    d'administration, sans que personne ne puisse s'y connecter.
   *
   * L'e-mail inconnu est donc un REFUS NOMMÉ, jamais un silence : c'est
   * exactement le défaut corrigé ailleurs dans ce dépôt (rattachement de
   * compte qui échouait sans le dire).
   *
   * L'unicité `@@unique([userId, clubId])` arbitre le doublon — la base, pas
   * une lecture préalable.
   */
  async invite(
    clubId: string,
    actorUserId: string,
    input: { email: string; role: MembershipRole },
  ): Promise<ClubTeamMemberGraph> {
    await this.assertActorIsClubAdmin(clubId, actorUserId);

    const email = input.email.trim().toLowerCase();

    // Lecture de RÉSOLUTION (e-mail → compte), pas d'arbitrage : elle ne
    // décide d'aucun invariant. Le doublon est tranché par l'index unique
    // ci-dessous, la frontière club par le `clubId` de l'écriture.
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, email: true, displayName: true },
    });
    if (!user) {
      throw new NotFoundException(
        `Aucun compte ClubFlow n’existe avec l’adresse « ${email} ». ` +
          'La personne doit d’abord créer son compte (ou recevoir une invitation ' +
          'depuis sa fiche adhérent) ; l’accès à l’espace d’administration se donne ensuite ici.',
      );
    }

    try {
      const created = await this.prisma.clubMembership.create({
        data: { clubId, userId: user.id, role: input.role },
        select: { id: true, createdAt: true, role: true },
      });
      this.log.log(
        `[club-team] Accès accordé (club ${clubId}) : ${email} → ${created.role}.`,
      );
      return {
        membershipId: created.id,
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
        role: created.role,
        createdAt: created.createdAt,
        isSelf: user.id === actorUserId,
        isLastAdmin: false,
      };
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          `« ${email} » a déjà un accès à cet espace. Changez son rôle depuis la liste.`,
        );
      }
      throw e;
    }
  }

  /**
   * Change le rôle d'un accès existant.
   *
   * La condition « il reste un autre administrateur » n'est posée que si le
   * rôle CIBLE n'est pas administrateur : une PROMOTION ne peut pas faire
   * disparaître un administrateur, elle en ajoute un.
   */
  async setRole(
    clubId: string,
    actorUserId: string,
    input: { membershipId: string; role: MembershipRole },
  ): Promise<void> {
    await this.assertActorIsClubAdmin(clubId, actorUserId);
    const { membershipId, role } = input;
    const retrograde = role !== MembershipRole.CLUB_ADMIN;

    await this.prisma.$transaction(async (tx) => {
      await this.serialiserLesEcrituresDEquipe(tx, clubId);

      const updated = await tx.clubMembership.updateMany({
        where: {
          id: membershipId,
          clubId, // frontière multi-tenant, DANS l'écriture
          userId: { not: actorUserId }, // GARDE-FOU 2
          ...(retrograde ? this.resteUnAutreAdmin(membershipId) : {}), // GARDE-FOU 1
        },
        data: { role },
      });

      if (updated.count === 1) return;
      throw await this.refus(tx, {
        clubId,
        membershipId,
        actorUserId,
        verbe: 'modifier le rôle de',
        dernierAdminPossible: retrograde,
      });
    });
  }

  /** Retire l'accès back-office. Ne touche ni au compte, ni à la fiche membre. */
  async remove(
    clubId: string,
    actorUserId: string,
    membershipId: string,
  ): Promise<void> {
    await this.assertActorIsClubAdmin(clubId, actorUserId);

    await this.prisma.$transaction(async (tx) => {
      await this.serialiserLesEcrituresDEquipe(tx, clubId);

      const deleted = await tx.clubMembership.deleteMany({
        where: {
          id: membershipId,
          clubId, // frontière multi-tenant, DANS l'écriture
          userId: { not: actorUserId }, // GARDE-FOU 2
          ...this.resteUnAutreAdmin(membershipId), // GARDE-FOU 1
        },
      });

      if (deleted.count === 1) return;
      throw await this.refus(tx, {
        clubId,
        membershipId,
        actorUserId,
        verbe: 'retirer',
        dernierAdminPossible: true,
      });
    });
  }

  // -----------------------------------------------------------------
  // Internes
  // -----------------------------------------------------------------

  /**
   * Le prédicat du garde-fou « dernier administrateur », sous la forme
   * exacte qu'il prend dans le WHERE de l'écriture.
   *
   * Se lit : « ou bien cette ligne n'est pas un administrateur (la retirer
   * n'enlève donc rien), ou bien il existe un AUTRE administrateur dans ce
   * même club ». Le `some` sur la relation `club.memberships` est déjà scopé
   * au club de la ligne : PostgreSQL reçoit un `EXISTS` corrélé.
   */
  private resteUnAutreAdmin(membershipId: string) {
    return {
      OR: [
        { role: { not: MembershipRole.CLUB_ADMIN } },
        {
          club: {
            memberships: {
              some: {
                role: MembershipRole.CLUB_ADMIN,
                id: { not: membershipId },
              },
            },
          },
        },
      ],
    };
  }

  /**
   * Sérialise les écritures d'équipe D'UN SEUL club, le temps de la
   * transaction. Ne lit rien, ne compte rien, n'arbitre rien : sans lui,
   * l'`EXISTS` de `resteUnAutreAdmin` pourrait être évalué sur un état déjà
   * périmé par une transaction concurrente (write-skew), et deux retraits
   * simultanés videraient le club.
   */
  private async serialiserLesEcrituresDEquipe(
    tx: Prisma.TransactionClient,
    clubId: string,
  ): Promise<void> {
    // `$executeRaw` et NON `$queryRaw`, et ce n'est pas un détail de style :
    // `pg_advisory_xact_lock()` renvoie `void`, un type que le pilote Prisma
    // ne sait pas désérialiser. `$queryRaw` tentait de lire la colonne et
    // levait « Failed to deserialize column of type 'void' » — à CHAQUE appel.
    //
    // Le verrou ne se posait donc jamais : tout retrait et tout changement de
    // rôle échouaient. Les tests unitaires ne pouvaient pas le voir, leur faux
    // Prisma simulant `$queryRaw` sans jamais toucher au vrai pilote. Seul un
    // appel contre une vraie base l'a révélé.
    //
    // `$executeRaw` ne lit pas de résultat, il ne compte que les lignes
    // affectées — c'est exactement ce qu'il faut pour un effet de bord.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('clubflow:club-team'), hashtext(${clubId}))`;
  }

  /**
   * Construit l'erreur d'un refus, APRÈS que l'écriture l'a prononcé.
   *
   * Lecture purement DIAGNOSTIQUE : elle ne sert qu'à nommer la cause. Si
   * elle rate ou renvoie null, le refus tombe quand même — c'est testé.
   */
  private async refus(
    tx: Prisma.TransactionClient,
    args: {
      clubId: string;
      membershipId: string;
      actorUserId: string;
      verbe: string;
      dernierAdminPossible: boolean;
    },
  ): Promise<Error> {
    const row = await tx.clubMembership.findFirst({
      where: { id: args.membershipId, clubId: args.clubId },
      select: { userId: true, role: true },
    });

    if (!row) {
      return new NotFoundException(
        'Cet accès n’existe pas (ou plus) dans ce club.',
      );
    }
    if (row.userId === args.actorUserId) {
      return new ForbiddenException(
        `Vous ne pouvez pas ${args.verbe} votre propre accès. ` +
          'Demandez à un autre administrateur du club de le faire — sans quoi ' +
          'le club pourrait se retrouver sans personne pour y entrer.',
      );
    }
    if (args.dernierAdminPossible) {
      return new ConflictException(
        'C’est le dernier administrateur du club : le retirer ou le rétrograder ' +
          'laisserait le club sans aucun accès d’administration. Nommez d’abord ' +
          'un second administrateur.',
      );
    }
    return new ConflictException('Modification refusée.');
  }

  /**
   * Les écritures d'équipe sont réservées à l'ADMINISTRATEUR du club.
   *
   * `ClubAdminRoleGuard` laisse aussi passer BUREAU et TRÉSORERIE : sans ce
   * resserrement, un trésorier pourrait se promouvoir administrateur. Les
   * administrateurs SYSTÈME restent autorisés — c'est le recours de la
   * plateforme quand un club s'est verrouillé lui-même.
   *
   * Contrôle d'AUTORISATION, pas d'arbitrage d'invariant : les deux
   * garde-fous restent tenus par le prédicat des écritures.
   */
  private async assertActorIsClubAdmin(
    clubId: string,
    actorUserId: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { systemRole: true },
    });
    if (
      user?.systemRole === SystemRole.ADMIN ||
      user?.systemRole === SystemRole.SUPER_ADMIN
    ) {
      return;
    }
    const membership = await this.prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId: actorUserId, clubId } },
      select: { role: true },
    });
    if (membership?.role !== MembershipRole.CLUB_ADMIN) {
      throw new ForbiddenException(
        'Seul un administrateur du club peut gérer les accès à l’espace d’administration.',
      );
    }
  }
}
