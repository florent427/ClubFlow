import type { INestApplication } from '@nestjs/common';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule, Query, Resolver } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import '../graphql/register-enums';
import { AccountingDocumentGraph } from '../accounting/models/accounting-entry.model';
import { GrantDocumentGraph } from '../external-finance/models/grant-application.model';
import { SponsorshipDocumentGraph } from '../external-finance/models/sponsorship-deal.model';
import { MediaUrlSignerService } from './media-url-signer.service';

/**
 * Justificatifs (compta, subventions, sponsoring) affichés par l'admin dans
 * un `<iframe>` ou un lien : le navigateur n'y joint aucun en-tête, donc le
 * droit de lecture doit voyager dans l'URL. Sans signature, `GET /media/:id`
 * répond « Asset introuvable » sur ces fichiers privés (prod, 2026-10-21).
 *
 * Le middleware de champ ne s'exécute qu'avec un vrai serveur GraphQL : un
 * schéma seul ne le prouverait pas. D'où l'aller-retour HTTP.
 */
const ASSET_ID = '0b5e3a52-6f1c-4d8e-9a27-3c4b5d6e7f80';
const STORED_URL = `https://api.example.test/media/${ASSET_ID}`;

@Resolver()
class JustificatifsResolver {
  @Query(() => AccountingDocumentGraph)
  accountingDoc(): AccountingDocumentGraph {
    return {
      id: 'd1',
      mediaAssetId: ASSET_ID,
      fileName: 'ticket.pdf',
      publicUrl: STORED_URL,
      mimeType: 'application/pdf',
    };
  }

  @Query(() => GrantDocumentGraph)
  grantDoc(): Pick<GrantDocumentGraph, 'publicUrl'> {
    return { publicUrl: STORED_URL };
  }

  @Query(() => SponsorshipDocumentGraph)
  sponsorshipDoc(): Pick<SponsorshipDocumentGraph, 'publicUrl'> {
    return { publicUrl: STORED_URL };
  }
}

jest.setTimeout(30_000);

describe('URL des justificatifs — signée à la sortie GraphQL', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        GraphQLModule.forRoot<ApolloDriverConfig>({
          driver: ApolloDriver,
          autoSchemaFile: true,
        }),
      ],
      providers: [JustificatifsResolver],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(['accountingDoc', 'grantDoc', 'sponsorshipDoc'])(
    '%s.publicUrl est servie par GET /media/:id sans en-tête',
    async (field) => {
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query: `{ ${field} { publicUrl } }` });
      const url = String(res.body?.data?.[field]?.publicUrl);

      expect(url.startsWith(`${STORED_URL}?`)).toBe(true);
      const params = new URL(url).searchParams;
      expect(
        new MediaUrlSignerService().verify(
          ASSET_ID,
          params.get('exp') ?? undefined,
          params.get('sig') ?? undefined,
        ),
      ).toBe(true);
    },
  );
});
