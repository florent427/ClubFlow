import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { MemberStatus, MembershipRole, SystemRole } from '@prisma/client';
import request from 'supertest';
import { AccountingExportController } from '../../accounting/accounting-export.controller';
import { AccountingExportService } from '../../accounting/accounting-export.service';
import { JwtStrategy } from '../../auth/jwt.strategy';
import { EventAttachmentsController } from '../../events/event-attachments.controller';
import { EventAttachmentsService } from '../../events/event-attachments.service';
import { MediaAssetsService } from '../../media/media-assets.service';
import { MediaUrlSignerService } from '../../media/media-url-signer.service';
import { MediaController } from '../../media/media.controller';
import { InvoicePdfController } from '../../pdf/invoice-pdf.controller';
import { InvoicePdfService } from '../../pdf/invoice-pdf.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Les routes REST d'un club — factures PDF, exports comptables, pièces jointes
 * d'événements, médiathèque — prennent le club dans l'en-tête `X-Club-Id`. Cet
 * en-tête se falsifie et l'identifiant d'un club est public : la garde vérifie
 * que le compte du jeton appartient au club, avec le rôle requis.
 *
 * Ces tests montent les vrais contrôleurs derrière la vraie stratégie JWT, et
 * leur envoient de vraies requêtes. Une route que la garde ne couvre pas répond
 * au compte d'un autre club, et le test le voit.
 */

const SECRET = process.env.JWT_SECRET ?? 'change-me-in-development';

type Route = { nom: string; method: 'get' | 'post' | 'delete'; path: string; fichier?: true };

/** Réservées au back-office du club : leurs pendants GraphQL le sont aussi. */
const BUREAU: Route[] = [
  { nom: 'facture PDF', method: 'get', path: '/invoices/inv-1/pdf' },
  { nom: 'export comptable CSV', method: 'get', path: '/accounting/export/csv' },
  { nom: 'export FEC', method: 'get', path: '/accounting/export/fec' },
  { nom: 'pièces jointes d’un événement', method: 'get', path: '/events/ev-1/attachments' },
  { nom: 'suppression d’une pièce jointe', method: 'delete', path: '/events/ev-1/attachments/att-1' },
];
/** Réservées au back-office ; seul le refus est rejoué, sans fichier à servir. */
const BUREAU_REFUS: Route[] = [
  { nom: 'téléchargement d’une pièce jointe', method: 'get', path: '/events/ev-1/attachments/att-1' },
  { nom: 'envoi d’une pièce jointe', method: 'post', path: '/events/ev-1/attachments', fichier: true },
];
/** Réservées à l'équipe : l'admin, l'appli admin et l'éditeur de la vitrine gèrent la médiathèque. */
const EQUIPE: Route[] = [
  { nom: 'liste de la médiathèque', method: 'get', path: '/media' },
  { nom: 'passage en public d’un média', method: 'post', path: '/media/m-1/public' },
  { nom: 'suppression d’un média', method: 'delete', path: '/media/m-1' },
];
/** Ouverte à tout le club : le portail et l'appli membre y envoient photos, messages et contributions. */
const ENVOI_MEDIA: Route = {
  nom: 'envoi dans la médiathèque',
  method: 'post',
  path: '/media/upload',
  fichier: true,
};

/**
 * Les comptes : une trésorière et un coach de l'équipe, l'admin d'un autre club,
 * un adhérent et un contact du club, un ancien adhérent, un adhérent et un
 * contact d'un autre club, et un admin de la plateforme.
 */
const USERS = [
  { id: 'u-tresoriere', systemRole: null },
  { id: 'u-coach', systemRole: null },
  { id: 'u-autre-club', systemRole: null },
  { id: 'u-adherent', systemRole: null },
  { id: 'u-contact', systemRole: null },
  { id: 'u-ancien', systemRole: null },
  { id: 'u-adherent-ailleurs', systemRole: null },
  { id: 'u-contact-ailleurs', systemRole: null },
  { id: 'u-plateforme', systemRole: SystemRole.ADMIN },
];
const MEMBERSHIPS = [
  { userId: 'u-tresoriere', clubId: 'club-1', role: MembershipRole.TREASURER },
  { userId: 'u-coach', clubId: 'club-1', role: MembershipRole.COACH },
  { userId: 'u-autre-club', clubId: 'club-2', role: MembershipRole.CLUB_ADMIN },
];
const MEMBERS = [
  { id: 'm-1', userId: 'u-adherent', clubId: 'club-1', status: MemberStatus.ACTIVE },
  { id: 'm-2', userId: 'u-ancien', clubId: 'club-1', status: MemberStatus.INACTIVE },
  { id: 'm-3', userId: 'u-adherent-ailleurs', clubId: 'club-2', status: MemberStatus.ACTIVE },
];
const CONTACTS = [
  { id: 'c-1', userId: 'u-contact', clubId: 'club-1' },
  { id: 'c-2', userId: 'u-contact-ailleurs', clubId: 'club-2' },
];

function allowOnly(value: object, keys: string[]): void {
  for (const k of Object.keys(value)) {
    if (!keys.includes(k)) throw new Error(`clause non simulée : ${k}`);
  }
}

/** Double de PostgreSQL : chaque clause du `where` est appliquée, les autres lèvent. */
function makePrisma() {
  return {
    user: {
      findUnique: jest.fn(async ({ where }: any) => {
        allowOnly(where, ['id']);
        const u = USERS.find((x) => x.id === where.id);
        return u ? { systemRole: u.systemRole } : null;
      }),
    },
    clubMembership: {
      findUnique: jest.fn(async ({ where }: any) => {
        allowOnly(where, ['userId_clubId']);
        const { userId, clubId } = where.userId_clubId;
        return MEMBERSHIPS.find((m) => m.userId === userId && m.clubId === clubId) ?? null;
      }),
    },
    member: {
      findFirst: jest.fn(async ({ where }: any) => {
        allowOnly(where, ['clubId', 'userId', 'status']);
        const m = MEMBERS.find(
          (x) =>
            (where.clubId === undefined || x.clubId === where.clubId) &&
            (where.userId === undefined || x.userId === where.userId) &&
            (where.status === undefined || x.status === where.status),
        );
        return m ? { id: m.id } : null;
      }),
    },
    contact: {
      findFirst: jest.fn(async ({ where }: any) => {
        allowOnly(where, ['clubId', 'userId']);
        const c = CONTACTS.find(
          (x) =>
            (where.clubId === undefined || x.clubId === where.clubId) &&
            (where.userId === undefined || x.userId === where.userId),
        );
        return c ? { id: c.id } : null;
      }),
    },
    club: {
      findUnique: jest.fn(async ({ where }: any) => {
        allowOnly(where, ['id']);
        return where.id === 'club-1' ? { id: 'club-1', slug: 'dojo', siret: null } : null;
      }),
    },
    clubModule: {
      findUnique: jest.fn(async ({ where }: any) => {
        allowOnly(where, ['clubId_moduleCode']);
        return where.clubId_moduleCode.clubId === 'club-1' ? { enabled: true } : null;
      }),
    },
    invoice: {
      findFirst: jest.fn(async ({ where }: any) => {
        allowOnly(where, ['id', 'clubId']);
        return where.id === 'inv-1' && where.clubId === 'club-1'
          ? { isCreditNote: false, purpose: 'CHARGE' }
          : null;
      }),
    },
  };
}

let app: INestApplication;
let comptabilite: { exportCsv: jest.Mock; exportFec: jest.Mock };
let media: {
  listByClub: jest.Mock;
  markPublic: jest.Mock;
  delete: jest.Mock;
  uploadImage: jest.Mock;
};

beforeAll(async () => {
  comptabilite = {
    exportCsv: jest.fn(async () => 'date;libellé'),
    exportFec: jest.fn(async () => 'JournalCode'),
  };
  media = {
    listByClub: jest.fn(async () => []),
    markPublic: jest.fn(async () => true),
    delete: jest.fn(async () => true),
    uploadImage: jest.fn(async () => ({
      id: 'm-photo',
      clubId: 'club-1',
      kind: 'IMAGE',
      fileName: 'photo.png',
      mimeType: 'image/png',
      sizeBytes: 3,
      publicUrl: '/media/m-photo',
      ownerKind: null,
      ownerId: null,
      createdAt: new Date(),
    })),
  };
  const moduleRef = await Test.createTestingModule({
    imports: [PassportModule],
    controllers: [
      InvoicePdfController,
      AccountingExportController,
      EventAttachmentsController,
      MediaController,
    ],
    providers: [
      JwtStrategy,
      { provide: PrismaService, useValue: makePrisma() },
      {
        provide: InvoicePdfService,
        useValue: { buildInvoicePdf: jest.fn(async () => Buffer.from('%PDF-1.4')) },
      },
      { provide: AccountingExportService, useValue: comptabilite },
      {
        provide: EventAttachmentsService,
        useValue: {
          listForEvent: jest.fn(async () => []),
          remove: jest.fn(async () => true),
        },
      },
      { provide: MediaAssetsService, useValue: media },
      { provide: JwtService, useValue: new JwtService({ secret: SECRET }) },
      { provide: MediaUrlSignerService, useValue: { verify: jest.fn(() => false) } },
    ],
  }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  await app.init();
});

afterAll(async () => {
  await app?.close();
});

beforeEach(() => jest.clearAllMocks());

const jeton = (userId: string) =>
  new JwtService({ secret: SECRET }).sign({ sub: userId, email: `${userId}@exemple.fr` });

/** Une requête du compte `userId` sur une route, pour le club `club-1` sauf mention contraire. */
const appeler = (route: Route, userId: string | null, clubId: string | null = 'club-1') => {
  let req = request(app.getHttpServer())[route.method](route.path);
  if (userId) req = req.set('Authorization', `Bearer ${jeton(userId)}`);
  if (clubId) req = req.set('X-Club-Id', clubId);
  if (route.fichier) req = req.attach('file', Buffer.from('png'), 'photo.png');
  return req;
};

const reussi = (status: number) => status >= 200 && status < 300;

describe.each([...BUREAU, ...BUREAU_REFUS, ...EQUIPE, ENVOI_MEDIA])('$nom', (route) => {
  it('refuse l’admin d’un autre club, qui envoie l’identifiant de ce club', async () => {
    const res = await appeler(route, 'u-autre-club');
    expect(res.status).toBe(403);
  });
});

describe.each([...BUREAU, ...BUREAU_REFUS, ...EQUIPE])('$nom', (route) => {
  it('refuse un adhérent, qui n’a pas de rôle dans l’équipe du club', async () => {
    const res = await appeler(route, 'u-adherent');
    expect(res.status).toBe(403);
  });
});

describe('le back-office du club', () => {
  it.each(BUREAU)('$nom : la trésorière du club passe', async (route) => {
    const res = await appeler(route, 'u-tresoriere');
    expect(reussi(res.status)).toBe(true);
  });

  it.each([...BUREAU, ...BUREAU_REFUS])('$nom : un coach du club est refusé', async (route) => {
    const res = await appeler(route, 'u-coach');
    expect(res.status).toBe(403);
  });

  it('un export refusé n’est même pas calculé', async () => {
    await appeler(BUREAU[2], 'u-autre-club');
    expect(comptabilite.exportFec).not.toHaveBeenCalled();
  });
});

describe('l’équipe du club', () => {
  it.each(EQUIPE)('$nom : un coach du club passe', async (route) => {
    const res = await appeler(route, 'u-coach');
    expect(reussi(res.status)).toBe(true);
  });

  it('une suppression refusée ne touche à rien', async () => {
    await appeler(EQUIPE[2], 'u-autre-club');
    expect(media.delete).not.toHaveBeenCalled();
  });
});

describe('l’envoi dans la médiathèque, ouvert à tout le club', () => {
  it.each([
    ['un adhérent du club, depuis le portail ou l’appli', 'u-adherent'],
    ['un contact du club', 'u-contact'],
    ['un coach de l’équipe', 'u-coach'],
  ])('%s envoie son fichier', async (_qui, userId) => {
    const res = await appeler(ENVOI_MEDIA, userId);
    expect(res.status).toBe(201);
    expect(media.uploadImage).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['un adhérent d’un autre club', 'u-adherent-ailleurs'],
    ['un contact d’un autre club', 'u-contact-ailleurs'],
    ['un ancien adhérent, dont la fiche est inactive', 'u-ancien'],
  ])('%s est refusé, et rien n’est enregistré', async (_qui, userId) => {
    const res = await appeler(ENVOI_MEDIA, userId);
    expect(res.status).toBe(403);
    expect(media.uploadImage).not.toHaveBeenCalled();
  });
});

describe('les admins de la plateforme et les requêtes incomplètes', () => {
  it('un admin système passe, sans adhésion au club', async () => {
    expect(reussi((await appeler(BUREAU[2], 'u-plateforme')).status)).toBe(true);
    expect(reussi((await appeler(EQUIPE[0], 'u-plateforme')).status)).toBe(true);
  });

  it('sans en-tête X-Club-Id : 400', async () => {
    const res = await appeler(BUREAU[0], 'u-tresoriere', null);
    expect(res.status).toBe(400);
  });

  it('sans jeton : 401', async () => {
    const res = await appeler(EQUIPE[0], null);
    expect(res.status).toBe(401);
  });
});
