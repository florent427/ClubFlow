import { MemberStatus } from '@prisma/client';
import { MemberAccountActivationService } from './member-account-activation.service';

/**
 * L'INCIDENT DE PRODUCTION, REJOUÉ.
 *
 * Le propriétaire du club s'est connecté au portail membre et est tombé sur
 * une fiche de démonstration. Sa vraie fiche portait le bon e-mail mais aucun
 * `userId` : l'index `@@unique([clubId, userId])` réservait la place à une
 * vieille fiche « Compte Portail démo », et le rattachement automatique par
 * e-mail échouait ICI — SANS UN MOT. Deux mois sans que personne le sache.
 *
 * Ces tests existent pour que ce cas ne puisse plus jamais être silencieux.
 */

const CLUB = 'club-1';
const USER = 'user-florent';

class UniqueViolation extends Error {
  code = 'P2002';
  constructor() {
    super('Unique constraint failed on the fields: (`clubId`,`userId`)');
  }
}

type Options = {
  /** Une autre fiche du club détient déjà le compte → l'écriture est rejetée. */
  placePrise: boolean;
  /** La lecture diagnostique retrouve-t-elle la fiche squatteuse ? */
  squatteurVisible?: boolean;
};

function build(opts: Options) {
  const cible = {
    id: 'm-vraie',
    userId: null as string | null,
    firstName: 'Florent',
    lastName: 'Morel',
    status: MemberStatus.ACTIVE,
    club: { name: 'SKSR' },
  };
  const squatteur = {
    id: 'm-demo',
    firstName: 'Compte',
    lastName: 'Portail démo',
    email: 'florent@example.com',
  };

  let appelsFindFirstMember = 0;
  const prisma = {
    member: {
      findFirst: jest.fn(async () => {
        appelsFindFirstMember += 1;
        // 1er appel : la fiche cible. 2e appel : la lecture diagnostique.
        if (appelsFindFirstMember === 1) return cible;
        return opts.squatteurVisible === false ? null : squatteur;
      }),
      updateMany: jest.fn(async (_args: { where: Record<string, unknown> }) => {
        void _args;
        if (opts.placePrise) throw new UniqueViolation();
        cible.userId = USER;
        return { count: 1 };
      }),
    },
    familyMember: { findMany: jest.fn(async () => []) },
    user: {
      findUnique: jest.fn(async () => ({
        id: USER,
        passwordHash: 'deja-un-mdp',
        emailVerifiedAt: new Date(),
      })),
      create: jest.fn(),
    },
  };
  const passwordReset = { issueTokenForUser: jest.fn(async () => 'tok') };
  const mail = { sendMemberAccountActivationLink: jest.fn(async () => {}) };

  const service = new MemberAccountActivationService(
    prisma as never,
    passwordReset as never,
    mail as never,
  );
  const log = (service as unknown as { log: { error: jest.Mock; warn: jest.Mock } })
    .log;
  const erreurs = jest.spyOn(log, 'error').mockImplementation(() => undefined);
  const avertissements = jest
    .spyOn(log, 'warn')
    .mockImplementation(() => undefined);

  return { service, prisma, erreurs, avertissements, cible };
}

function activer(service: MemberAccountActivationService) {
  return service.maybeActivateMemberAccount({
    clubId: CLUB,
    memberId: 'm-vraie',
    previousEmail: null,
    newEmail: 'florent@example.com',
  });
}

describe('MemberAccountActivationService — conflit de rattachement', () => {
  it('cas nominal : la place est libre, la fiche est rattachée sans bruit', async () => {
    const { service, erreurs, cible } = build({ placePrise: false });
    const res = await activer(service);
    expect(cible.userId).toBe(USER);
    expect(res.reason).not.toBe('link-conflict');
    expect(erreurs).not.toHaveBeenCalled();
  });

  it('la place est prise : l’échec est SIGNALÉ, pas avalé', async () => {
    const { service, erreurs } = build({ placePrise: true });
    const res = await activer(service);

    expect(res.activationSent).toBe(false);
    expect(res.reason).toBe('link-conflict');

    // ⚠️ C'EST CE QUI MANQUAIT. Un `warn` anonyme ne suffit pas : il faut un
    // ERROR, et il doit NOMMER les deux fiches en conflit — sans quoi
    // l'exploitant ne peut rien en faire.
    expect(erreurs).toHaveBeenCalledTimes(1);
    const message = String(erreurs.mock.calls[0][0]);
    expect(message).toContain('CONFLIT DE RATTACHEMENT');
    expect(message).toContain('Portail démo'); // la fiche qui squatte
    expect(message).toContain('m-demo');
    expect(message).toContain('Florent Morel'); // la fiche lésée
    expect(message).toContain('m-vraie');
  });

  it('le conflit remonte à l’appelant sous forme exploitable', async () => {
    const { service } = build({ placePrise: true });
    const res = await activer(service);
    // Sans ce payload, l'échec reste un booléen `false` indiscernable d'un
    // « rien à faire » — l'admin n'a aucun moyen de proposer le déplacement.
    expect(res.conflict).toEqual({
      userId: USER,
      heldByMemberId: 'm-demo',
      heldByMemberName: 'Compte Portail démo',
    });
  });

  it('signale même si la fiche squatteuse est introuvable', async () => {
    const { service, erreurs } = build({
      placePrise: true,
      squatteurVisible: false,
    });
    const res = await activer(service);
    // La détection ne dépend PAS de la lecture diagnostique : elle vient du
    // résultat de l'écriture. Un diagnostic muet ne doit pas re-rendre
    // l'échec silencieux.
    expect(res.reason).toBe('link-conflict');
    expect(erreurs).toHaveBeenCalledTimes(1);
    expect(String(erreurs.mock.calls[0][0])).toContain('CONFLIT');
    expect(res.conflict?.heldByMemberId).toBeNull();
  });

  it('l’écriture porte le clubId ET refuse d’écraser un lien existant', async () => {
    const { service, prisma } = build({ placePrise: false });
    await activer(service);
    const where = prisma.member.updateMany.mock.calls[0][0].where;
    // La frontière multi-tenant est tenue par la requête qui écrit...
    expect(where.clubId).toBe(CLUB);
    // ...et `userId: null` interdit d'arracher un compte déjà rattaché
    // ailleurs sur cette même fiche.
    expect(where.userId).toBeNull();
    expect(where.id).toBe('m-vraie');
  });
});
