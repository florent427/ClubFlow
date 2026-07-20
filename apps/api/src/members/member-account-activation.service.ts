import { Injectable, Logger } from '@nestjs/common';
import { MemberStatus } from '@prisma/client';
import { PasswordResetService } from '../auth/password-reset.service';
import { TransactionalMailService } from '../mail/transactional-mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeMemberEmail } from './member-email-family-rule';

/**
 * Résultat d'une tentative d'activation.
 *
 * `conflict` n'est renseigné QUE pour `reason === 'link-conflict'` : c'est le
 * signal exploitable côté admin. Sans lui, l'échec restait un simple booléen
 * `false` indiscernable d'un « rien à faire » — et c'est précisément ce qui a
 * rendu l'incident de production invisible.
 */
export type MemberAccountActivationResult = {
  activationSent: boolean;
  reason: string;
  conflict?: {
    userId: string;
    heldByMemberId: string | null;
    heldByMemberName: string | null;
  };
};

/**
 * Service qui prend en charge l'activation du compte portail d'un Member
 * (typiquement un enfant) lorsque son adresse e-mail vient d'être
 * renseignée pour la première fois avec une adresse perso.
 *
 * Flow :
 *   1. L'enfant (ou son parent) modifie l'e-mail du Member dans
 *      Settings ou via l'admin → on détecte le changement.
 *   2. Si la nouvelle adresse n'est pas déjà l'e-mail d'un payeur du
 *      foyer (= partage d'inbox volontaire) ET n'a pas encore de
 *      compte User côté DB → on crée le User (passwordHash null,
 *      emailVerifiedAt = NOW car l'e-mail est confirmé par le clic
 *      sur le lien d'activation) et on rattache le Member dessus.
 *   3. On émet un token password-reset et on envoie un mail au Member
 *      avec un lien vers `/reset-password?token=...` du portail.
 *   4. L'enfant clique → définit son mot de passe → peut se connecter
 *      à son propre espace adhérent.
 *
 * Si l'e-mail correspond déjà à un User existant (User pré-existant
 * dans le système, ex Contact), on rattache simplement le Member à ce
 * User sans envoyer de mail (aucune réactivation nécessaire).
 *
 * Si l'e-mail correspond à un payeur du foyer (= mail du parent), on
 * ne fait rien (l'enfant continue de partager la boîte du parent).
 */
@Injectable()
export class MemberAccountActivationService {
  private readonly log = new Logger(MemberAccountActivationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordReset: PasswordResetService,
    private readonly mail: TransactionalMailService,
  ) {}

  /**
   * À appeler après tout update de Member.email. `previousEmail` permet
   * de détecter le changement réel et d'éviter de spammer si l'admin
   * sauvegarde sans modifier.
   */
  async maybeActivateMemberAccount(args: {
    clubId: string;
    memberId: string;
    previousEmail: string | null;
    newEmail: string;
  }): Promise<MemberAccountActivationResult> {
    const next = normalizeMemberEmail(args.newEmail);
    const prev = normalizeMemberEmail(args.previousEmail ?? '');
    if (!next) {
      return { activationSent: false, reason: 'no-email' };
    }
    if (next === prev) {
      return { activationSent: false, reason: 'unchanged' };
    }
    const member = await this.prisma.member.findFirst({
      where: { id: args.memberId, clubId: args.clubId },
      select: {
        id: true,
        userId: true,
        firstName: true,
        lastName: true,
        status: true,
        club: { select: { name: true } },
      },
    });
    if (!member || member.status !== MemberStatus.ACTIVE) {
      return { activationSent: false, reason: 'member-inactive' };
    }
    if (member.userId) {
      // Le Member a déjà un User → on n'enverra pas de lien
      // d'activation. Si l'e-mail change, on devrait propager au
      // User (déjà fait par le caller via le sync). Pas de mail.
      return { activationSent: false, reason: 'member-already-has-user' };
    }

    // L'e-mail est-il celui d'un payeur du foyer ? Si oui, on
    // considère que c'est volontaire (boîte partagée), pas
    // d'activation séparée.
    const familyLinks = await this.prisma.familyMember.findMany({
      where: { memberId: args.memberId },
      select: { familyId: true },
    });
    if (familyLinks.length > 0) {
      const familyIds = familyLinks.map((f) => f.familyId);
      const payerEmails = await this.prisma.familyMember.findMany({
        where: {
          familyId: { in: familyIds },
          linkRole: 'PAYER',
        },
        select: {
          member: { select: { email: true } },
          contact: { select: { user: { select: { email: true } } } },
        },
      });
      const payerEmailSet = new Set<string>();
      for (const link of payerEmails) {
        if (link.member?.email) {
          payerEmailSet.add(normalizeMemberEmail(link.member.email));
        }
        if (link.contact?.user?.email) {
          payerEmailSet.add(normalizeMemberEmail(link.contact.user.email));
        }
      }
      if (payerEmailSet.has(next)) {
        return { activationSent: false, reason: 'shared-with-payer' };
      }
    }

    // L'e-mail correspond-t-il à un User existant ?
    let user = await this.prisma.user.findUnique({
      where: { email: next },
      select: { id: true, passwordHash: true, emailVerifiedAt: true },
    });
    if (!user) {
      // Création User pour l'enfant. emailVerifiedAt = NOW car la
      // confirmation se fait par clic sur le lien (pattern OAuth-like).
      const created = await this.prisma.user.create({
        data: {
          email: next,
          passwordHash: null,
          emailVerifiedAt: new Date(),
          displayName: `${member.firstName} ${member.lastName}`.trim(),
        },
        select: { id: true, passwordHash: true, emailVerifiedAt: true },
      });
      user = created;
    }
    // Rattachement Member ↔ User.
    //
    // LA GARANTIE EST DANS LE WHERE : `clubId` (frontière multi-tenant) et
    // `userId: null` (on ne remplace jamais un lien existant). `count` atteste
    // du résultat — pas une lecture préalable.
    //
    // ⚠️ CE BLOC EST LA CAUSE RACINE D'UN INCIDENT DE PRODUCTION. Il échouait
    // SILENCIEUSEMENT : l'index `@@unique([clubId, userId])` interdit qu'un
    // compte soit lié à deux fiches du même club, donc quand la place était
    // déjà prise par une vieille fiche (« Compte Portail démo »), le
    // rattachement partait en P2002, était avalé par un `warn` anonyme, et
    // le propriétaire du club se connectait au portail sur la mauvaise fiche.
    // Personne ne l'a su pendant deux mois.
    //
    // Désormais : le conflit est DÉTECTÉ, la fiche qui squatte est NOMMÉE
    // dans un `log.error`, et son identité remonte à l'appelant via
    // `conflict` — de quoi proposer le déplacement depuis l'admin.
    let linked: { count: number };
    try {
      linked = await this.prisma.member.updateMany({
        where: { id: member.id, clubId: args.clubId, userId: null },
        data: { userId: user.id },
      });
    } catch {
      linked = { count: 0 };
    }
    if (linked.count !== 1) {
      // Lecture DIAGNOSTIQUE (après coup, jamais arbitrale) : qui détient la
      // place ? C'est CE nom qui manquait pour comprendre l'incident.
      const squatteur = await this.prisma.member.findFirst({
        where: { clubId: args.clubId, userId: user.id },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      const nomSquatteur = squatteur
        ? `${`${squatteur.firstName} ${squatteur.lastName}`.trim()} (${squatteur.id})`
        : 'inconnue';
      this.log.error(
        `[member-activation] CONFLIT DE RATTACHEMENT — le compte ${next} ` +
          `(User ${user.id}) est déjà rattaché à la fiche ${nomSquatteur} ` +
          `dans le club ${args.clubId} : la fiche ` +
          `${`${member.firstName} ${member.lastName}`.trim()} (${member.id}) ` +
          `NE SERA PAS rattachée et son titulaire verra la mauvaise fiche au ` +
          `portail. Résolution : rattacher le compte à la bonne fiche depuis ` +
          `l'admin (action « Rattacher à un compte », déplacement confirmé).`,
      );
      return {
        activationSent: false,
        reason: 'link-conflict',
        conflict: {
          userId: user.id,
          heldByMemberId: squatteur?.id ?? null,
          heldByMemberName: squatteur
            ? `${squatteur.firstName} ${squatteur.lastName}`.trim()
            : null,
        },
      };
    }

    // Si l'utilisateur a DÉJÀ un mot de passe, ne pas en redemander.
    if (user.passwordHash) {
      return { activationSent: false, reason: 'user-already-has-password' };
    }

    // Émet un token password-reset et envoie l'e-mail d'activation.
    const rawToken = await this.passwordReset.issueTokenForUser(user.id);
    const portalOrigin = (
      process.env.MEMBER_PORTAL_ORIGIN ?? 'http://localhost:5174'
    ).replace(/\/$/, '');
    const activationUrl = `${portalOrigin}/reset-password?token=${encodeURIComponent(rawToken)}`;
    try {
      await this.mail.sendMemberAccountActivationLink(args.clubId, next, {
        clubName: member.club.name,
        memberFirstName: member.firstName,
        activationUrl,
      });
    } catch (e) {
      this.log.warn(
        `[member-activation] Envoi de l'e-mail d'activation échoué (${next}) : ${(e as Error).message}`,
      );
      return { activationSent: false, reason: 'mail-error' };
    }
    return { activationSent: true, reason: 'sent' };
  }
}
