import { BadRequestException } from '@nestjs/common';
import type {
  ClubSendingDomainPurpose,
  ClubSendingDomainVerificationStatus,
} from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { ClubSendingDomainService } from './club-sending-domain.service';
import type { MailTransport } from './mail-transport.interface';

/**
 * Vécu en prod le 2026-09-21 : le domaine vérifié de SKSR portait le rôle
 * TRANSACTIONAL, donc l'envoi de campagne était refusé, et l'admin n'offrait
 * que « supprimer puis recréer » — ce qui coupait aussi les e-mails
 * transactionnels du club entre-temps.
 *
 * Le double Prisma ci-dessous applique les clauses du `where` qu'on lui
 * passe, et rien d'autre : s'il filtrait de lui-même par club, le service
 * pourrait oublier `clubId` sans qu'aucun test ne rougisse
 * (cf. pitfall double-ignore-une-clause-du-where).
 */

const CLUB = 'club-1';
const AUTRE_CLUB = 'club-2';

type Ligne = {
  id: string;
  clubId: string;
  fqdn: string;
  purpose: ClubSendingDomainPurpose;
  verificationStatus: ClubSendingDomainVerificationStatus;
  providerDomainId: string | null;
  dnsRecordsJson: string | null;
  lastCheckedAt: Date | null;
};

type Where = {
  id?: string | { not: string };
  clubId?: string | { not: string };
  verificationStatus?: ClubSendingDomainVerificationStatus;
};

function egal(valeur: string, clause: string | { not: string }): boolean {
  return typeof clause === 'string' ? valeur === clause : valeur !== clause.not;
}

function correspond(ligne: Ligne, where: Where): boolean {
  if (where.id !== undefined && !egal(ligne.id, where.id)) {
    return false;
  }
  if (where.clubId !== undefined && !egal(ligne.clubId, where.clubId)) {
    return false;
  }
  if (
    where.verificationStatus !== undefined &&
    ligne.verificationStatus !== where.verificationStatus
  ) {
    return false;
  }
  return true;
}

function ligne(over: Partial<Ligne> & Pick<Ligne, 'id'>): Ligne {
  return {
    clubId: CLUB,
    fqdn: `${over.id}.exemple.fr`,
    purpose: 'TRANSACTIONAL',
    verificationStatus: 'VERIFIED',
    providerDomainId: null,
    dnsRecordsJson: '[]',
    lastCheckedAt: null,
    ...over,
  };
}

function monde(lignes: Ligne[]) {
  const base = lignes.map((l) => ({ ...l }));
  const prisma = {
    clubSendingDomain: {
      findFirst: jest.fn(async ({ where }: { where: Where }) => {
        const hit = base.find((l) => correspond(l, where));
        return hit ? { ...hit } : null;
      }),
      findMany: jest.fn(async ({ where }: { where: Where }) =>
        base.filter((l) => correspond(l, where)).map((l) => ({ ...l })),
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<Ligne>;
        }) => {
          const cible = base.find((l) => l.id === where.id);
          if (!cible) {
            throw new Error(`update sur une ligne absente : ${where.id}`);
          }
          Object.assign(cible, data);
          return { ...cible };
        },
      ),
    },
  };
  const service = new ClubSendingDomainService(
    prisma as unknown as PrismaService,
    {} as unknown as MailTransport,
  );
  const purposeDe = (id: string) => base.find((l) => l.id === id)?.purpose;
  return { service, prisma, purposeDe };
}

describe('ClubSendingDomainService.updatePurpose', () => {
  it('corrige le rôle d’un domaine déjà vérifié sans le supprimer (cas SKSR)', async () => {
    const w = monde([
      ligne({ id: 'dom-1', fqdn: 'clubflow.topdigital.re', purpose: 'TRANSACTIONAL' }),
    ]);

    const res = await w.service.updatePurpose(CLUB, 'dom-1', 'BOTH');

    expect(res.purpose).toBe('BOTH');
    expect(w.purposeDe('dom-1')).toBe('BOTH');
    expect(res.verificationStatus).toBe('VERIFIED');
  });

  it('refuse un rôle déjà couvert par un autre domaine vérifié, sans rien écrire', async () => {
    const w = monde([
      ligne({ id: 'dom-1', purpose: 'TRANSACTIONAL' }),
      ligne({ id: 'dom-2', purpose: 'CAMPAIGN' }),
    ]);

    await expect(w.service.updatePurpose(CLUB, 'dom-1', 'BOTH')).rejects.toThrow(
      BadRequestException,
    );

    expect(w.prisma.clubSendingDomain.update).not.toHaveBeenCalled();
    expect(w.purposeDe('dom-1')).toBe('TRANSACTIONAL');
  });

  it('accepte un rôle disjoint de celui de l’autre domaine vérifié', async () => {
    const w = monde([
      ligne({ id: 'dom-1', purpose: 'BOTH' }),
      ligne({ id: 'dom-2', purpose: 'CAMPAIGN' }),
    ]);

    await w.service.updatePurpose(CLUB, 'dom-1', 'TRANSACTIONAL');

    expect(w.purposeDe('dom-1')).toBe('TRANSACTIONAL');
  });

  it('applique la garde même quand le domaine modifié n’est pas encore vérifié', async () => {
    const w = monde([
      ligne({ id: 'dom-1', purpose: 'CAMPAIGN', verificationStatus: 'PENDING' }),
      ligne({ id: 'dom-2', purpose: 'TRANSACTIONAL' }),
    ]);

    await expect(
      w.service.updatePurpose(CLUB, 'dom-1', 'TRANSACTIONAL'),
    ).rejects.toThrow(BadRequestException);

    expect(w.purposeDe('dom-1')).toBe('CAMPAIGN');
  });

  it('ignore les domaines non vérifiés du club dans le calcul du conflit', async () => {
    const w = monde([
      ligne({ id: 'dom-1', purpose: 'TRANSACTIONAL' }),
      ligne({ id: 'dom-2', purpose: 'CAMPAIGN', verificationStatus: 'PENDING' }),
    ]);

    await w.service.updatePurpose(CLUB, 'dom-1', 'BOTH');

    expect(w.purposeDe('dom-1')).toBe('BOTH');
  });

  it('ne se compare pas à lui-même : re-poser un rôle qui se recouvre reste possible', async () => {
    const w = monde([ligne({ id: 'dom-1', purpose: 'BOTH' })]);

    await w.service.updatePurpose(CLUB, 'dom-1', 'CAMPAIGN');

    expect(w.purposeDe('dom-1')).toBe('CAMPAIGN');
  });

  it('rôle inchangé : aucune écriture, et pas de refus', async () => {
    const w = monde([ligne({ id: 'dom-1', purpose: 'BOTH' })]);

    const res = await w.service.updatePurpose(CLUB, 'dom-1', 'BOTH');

    expect(res.purpose).toBe('BOTH');
    expect(w.prisma.clubSendingDomain.update).not.toHaveBeenCalled();
  });

  it('un domaine d’un autre club est inconnu, pas modifiable', async () => {
    const w = monde([ligne({ id: 'dom-1', clubId: AUTRE_CLUB, purpose: 'TRANSACTIONAL' })]);

    await expect(w.service.updatePurpose(CLUB, 'dom-1', 'BOTH')).rejects.toThrow(
      new BadRequestException('Domaine inconnu'),
    );

    expect(w.prisma.clubSendingDomain.update).not.toHaveBeenCalled();
    expect(w.purposeDe('dom-1')).toBe('TRANSACTIONAL');
  });

  it('le domaine vérifié d’un autre club ne crée pas de conflit', async () => {
    const w = monde([
      ligne({ id: 'dom-1', purpose: 'TRANSACTIONAL' }),
      ligne({ id: 'dom-2', clubId: AUTRE_CLUB, purpose: 'CAMPAIGN' }),
    ]);

    await w.service.updatePurpose(CLUB, 'dom-1', 'BOTH');

    expect(w.purposeDe('dom-1')).toBe('BOTH');
  });
});
