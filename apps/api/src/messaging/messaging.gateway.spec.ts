import { BadRequestException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { MemberStatus } from '@prisma/client';
import { ModuleCode } from '../domain/module-registry/module-codes';
import type { Socket } from 'socket.io';
import type { FamiliesService } from '../families/families.service';
import type { MediaUrlSignerService } from '../media/media-url-signer.service';
import type { PrismaService } from '../prisma/prisma.service';
import { CHAT_SOCKET_REVALIDATION_MS, MessagingGateway } from './messaging.gateway';

/**
 * Audit du 2026-09-14, point 1.5 : la socket du chat vérifiait le jeton et
 * l'appartenance au salon, jamais le statut du membre. Un membre radié lisait
 * ses salons tant que son jeton (7 jours) restait valable.
 */

const CLUB = 'club-1';

type Membre = { id: string; clubId: string; status: MemberStatus };

/** Le double lève sur toute clause qu'il ne simule pas : le service ne peut pas en oublier une. */
function exiger(where: Record<string, unknown>, cles: string[], modele: string) {
  for (const k of Object.keys(where)) {
    if (!cles.includes(k)) throw new Error(`Clause non simulée sur ${modele} : ${k}`);
  }
}

function monde() {
  const membres: Membre[] = [
    { id: 'm-alice', clubId: CLUB, status: MemberStatus.ACTIVE },
    { id: 'm-bob', clubId: CLUB, status: MemberStatus.ACTIVE },
    { id: 'm-ailleurs', clubId: 'club-2', status: MemberStatus.ACTIVE },
    { id: 'm-enfant', clubId: CLUB, status: MemberStatus.ACTIVE },
  ];
  const modules = new Map<string, boolean>([
    [CLUB, true],
    ['club-2', true],
  ]);
  const profils = new Map<string, Set<string>>([
    ['u-alice', new Set(['m-alice', 'm-enfant'])],
    ['u-bob', new Set(['m-bob'])],
    ['u-ailleurs', new Set(['m-ailleurs'])],
  ]);
  const salons = [{ id: 'salon-1', clubId: CLUB }];
  const appartenances = [
    { roomId: 'salon-1', memberId: 'm-alice' },
    { roomId: 'salon-1', memberId: 'm-bob' },
  ];
  const jetons = new Map<string, { sub: string; activeProfileMemberId?: string }>([
    ['jeton-alice', { sub: 'u-alice', activeProfileMemberId: 'm-alice' }],
    ['jeton-alice-enfant', { sub: 'u-alice', activeProfileMemberId: 'm-enfant' }],
    ['jeton-bob', { sub: 'u-bob', activeProfileMemberId: 'm-bob' }],
    ['jeton-ailleurs', { sub: 'u-ailleurs', activeProfileMemberId: 'm-ailleurs' }],
    ['jeton-contact', { sub: 'u-contact' }],
  ]);
  const panne = { membres: false };
  const lecturesMembre: string[] = [];

  const prisma = {
    member: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        exiger(where, ['id', 'clubId', 'status'], 'member');
        if (panne.membres) throw new Error('base indisponible');
        lecturesMembre.push(String(where.id));
        const m = membres.find(
          (x) =>
            x.id === where.id &&
            x.clubId === where.clubId &&
            (where.status === undefined || x.status === where.status),
        );
        return m ? { id: m.id } : null;
      }),
    },
    clubModule: {
      findUnique: jest.fn(
        async ({
          where,
        }: {
          where: { clubId_moduleCode: { clubId: string; moduleCode: ModuleCode } };
        }) => {
          exiger(where, ['clubId_moduleCode'], 'clubModule');
          const { clubId, moduleCode } = where.clubId_moduleCode;
          if (moduleCode !== ModuleCode.MESSAGING) return null;
          return modules.has(clubId) ? { enabled: modules.get(clubId) } : null;
        },
      ),
    },
    chatRoomMember: {
      findFirst: jest.fn(
        async ({
          where,
        }: {
          where: {
            memberId: string;
            member?: { status?: MemberStatus };
            room: { id: string; clubId: string };
          };
        }) => {
          exiger(where, ['memberId', 'member', 'room'], 'chatRoomMember');
          const a = appartenances.find((x) => {
            if (x.memberId !== where.memberId || x.roomId !== where.room.id) return false;
            const salon = salons.find((s) => s.id === x.roomId);
            if (salon?.clubId !== where.room.clubId) return false;
            const m = membres.find((y) => y.id === x.memberId);
            return where.member?.status === undefined || m?.status === where.member.status;
          });
          return a ?? null;
        },
      ),
    },
  };

  const families = {
    assertViewerHasProfile: jest.fn(async (userId: string, memberId: string) => {
      if (!profils.get(userId)?.has(memberId)) {
        throw new BadRequestException('Profil non accessible pour ce compte');
      }
    }),
  };

  const jwt = {
    verify: jest.fn((token: string) => {
      const p = jetons.get(token);
      if (!p) throw new Error('invalid signature');
      return p;
    }),
  };

  const gateway = new MessagingGateway(
    jwt as unknown as JwtService,
    prisma as unknown as PrismaService,
    { signUrl: (u: string | null | undefined) => u ?? null } as unknown as MediaUrlSignerService,
    families as unknown as FamiliesService,
  );

  // null : poignée de main sans club (un paramètre par défaut avalerait undefined).
  const socket = (token: string | undefined, clubId: string | null = CLUB) => {
    const s = {
      handshake: { auth: { token, clubId: clubId ?? undefined } },
      data: {} as Record<string, unknown>,
      disconnect: jest.fn(),
      join: jest.fn(async () => undefined),
      leave: jest.fn(async () => undefined),
    };
    return s;
  };
  type FausseSocket = ReturnType<typeof socket>;
  const connecter = (s: FausseSocket) => gateway.handleConnection(s as unknown as Socket);
  const rejoindre = (s: FausseSocket, roomId = 'salon-1') =>
    gateway.joinRoom(s as unknown as Socket, { roomId });
  const pret = (s: FausseSocket) => (s.data as { ready?: Promise<unknown> }).ready;
  const ouvertes: FausseSocket[] = [];
  gateway.server = {
    fetchSockets: jest.fn(async () => ouvertes),
  } as unknown as MessagingGateway['server'];

  return {
    gateway,
    membres,
    modules,
    profils,
    panne,
    lecturesMembre,
    socket,
    connecter,
    rejoindre,
    pret,
    ouvertes,
    desactiver: (id: string) => {
      membres.find((m) => m.id === id)!.status = MemberStatus.INACTIVE;
    },
  };
}

describe('MessagingGateway : accès temps réel au chat (audit 1.5)', () => {
  it('membre actif, profil du compte, messagerie activée : il rejoint le salon demandé dès « connect »', async () => {
    const w = monde();
    const s = w.socket('jeton-alice');

    // Les clients émettent joinRoom dans le handler « connect » : sans attendre
    // la fin du contrôle d'accès, la demande serait perdue.
    w.connecter(s);
    await w.rejoindre(s);

    expect(s.disconnect).not.toHaveBeenCalled();
    expect(s.join).toHaveBeenCalledWith('chat:salon-1');
  });

  it.each([
    ['membre désactivé', 'jeton-alice', CLUB, (w: ReturnType<typeof monde>) => w.desactiver('m-alice')],
    ['fiche d’un autre club que celui annoncé', 'jeton-ailleurs', CLUB, () => undefined],
    ['profil retiré du compte', 'jeton-alice', CLUB, (w: ReturnType<typeof monde>) => w.profils.get('u-alice')!.clear()],
    ['messagerie coupée pour le club', 'jeton-alice', CLUB, (w: ReturnType<typeof monde>) => w.modules.set(CLUB, false)],
    ['jeton invalide', 'jeton-faux', CLUB, () => undefined],
    ['jeton sans profil membre', 'jeton-contact', CLUB, () => undefined],
    ['club absent de la poignée de main', 'jeton-alice', null, () => undefined],
  ])('refusé : %s — déconnecté, et aucun salon rejoint', async (_cas, jeton, clubId, preparer) => {
    const w = monde();
    preparer(w);
    const s = w.socket(jeton, clubId);

    w.connecter(s);
    await w.rejoindre(s);

    expect(s.disconnect).toHaveBeenCalledWith(true);
    expect(s.join).not.toHaveBeenCalled();
  });

  it('une base indisponible au contrôle refuse la connexion', async () => {
    const w = monde();
    w.panne.membres = true;
    const s = w.socket('jeton-alice');

    w.connecter(s);
    await w.rejoindre(s);

    expect(s.disconnect).toHaveBeenCalledWith(true);
    expect(s.join).not.toHaveBeenCalled();
  });

  it('joinRoom refuse un membre désactivé après la connexion, et un salon dont il n’est pas membre', async () => {
    const w = monde();
    const s = w.socket('jeton-alice');
    w.connecter(s);
    await w.pret(s);

    await w.rejoindre(s, 'salon-inconnu');
    w.desactiver('m-alice');
    await w.rejoindre(s, 'salon-1');

    expect(s.join).not.toHaveBeenCalled();
  });

  it('le contrôle périodique coupe les connexions qui ont perdu l’accès, et elles seules', async () => {
    const w = monde();
    const alice = w.socket('jeton-alice');
    const bob = w.socket('jeton-bob');
    const refusee = w.socket('jeton-faux');
    for (const s of [alice, bob, refusee]) {
      w.connecter(s);
      await w.pret(s);
    }
    refusee.disconnect.mockClear();
    w.ouvertes.push(alice, bob, refusee);

    w.desactiver('m-bob');
    await w.gateway.revalidateConnectedSockets();

    expect(bob.disconnect).toHaveBeenCalledWith(true);
    expect(alice.disconnect).not.toHaveBeenCalled();
    expect(refusee.disconnect).not.toHaveBeenCalled();
  });

  it('le contrôle périodique coupe aussi un profil retiré du compte depuis la connexion', async () => {
    const w = monde();
    const alice = w.socket('jeton-alice');
    w.connecter(alice);
    await w.pret(alice);
    w.ouvertes.push(alice);

    w.profils.get('u-alice')!.delete('m-alice');
    await w.gateway.revalidateConnectedSockets();

    expect(alice.disconnect).toHaveBeenCalledWith(true);
  });

  it('deux profils d’un même compte : seul celui qui a perdu l’accès est coupé', async () => {
    const w = monde();
    const parent = w.socket('jeton-alice');
    const enfant = w.socket('jeton-alice-enfant');
    for (const s of [parent, enfant]) {
      w.connecter(s);
      await w.pret(s);
    }
    w.ouvertes.push(parent, enfant);

    w.desactiver('m-enfant');
    await w.gateway.revalidateConnectedSockets();

    expect(enfant.disconnect).toHaveBeenCalledWith(true);
    expect(parent.disconnect).not.toHaveBeenCalled();
  });

  it('une panne de lecture pendant le contrôle périodique ne coupe personne', async () => {
    const w = monde();
    const alice = w.socket('jeton-alice');
    w.connecter(alice);
    await w.pret(alice);
    w.ouvertes.push(alice);

    w.panne.membres = true;
    await w.gateway.revalidateConnectedSockets();

    expect(alice.disconnect).not.toHaveBeenCalled();
  });

  it('un compte ouvert sur plusieurs appareils n’est relu qu’une fois par passage', async () => {
    const w = monde();
    const tel = w.socket('jeton-alice');
    const pc = w.socket('jeton-alice');
    for (const s of [tel, pc]) {
      w.connecter(s);
      await w.pret(s);
    }
    w.ouvertes.push(tel, pc);
    w.lecturesMembre.length = 0;

    w.desactiver('m-alice');
    await w.gateway.revalidateConnectedSockets();

    expect(w.lecturesMembre).toEqual(['m-alice']);
    expect(tel.disconnect).toHaveBeenCalledWith(true);
    expect(pc.disconnect).toHaveBeenCalledWith(true);
  });

  it('le contrôle périodique est planifié toutes les 60 secondes', () => {
    expect(CHAT_SOCKET_REVALIDATION_MS).toBe(60_000);
    expect(
      Reflect.getMetadata(
        'SCHEDULE_INTERVAL_OPTIONS',
        MessagingGateway.prototype.revalidateConnectedSockets,
      ),
    ).toEqual({ timeout: 60_000 });
  });
});
