import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { MembershipRole } from '@prisma/client';
import { ModuleCode } from '../src/domain/module-registry/module-codes';

describe('ClubFlow API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const adminEmail = 'e2e-admin@clubflow.test';
  const adminPassword = 'E2eAdmin!pass';
  const staffEmail = 'e2e-staff@clubflow.test';
  const staffPassword = 'E2eStaff!pass';

  let clubId: string | undefined;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    prisma = moduleFixture.get(PrismaService);
    await app.init();

    for (const code of Object.values(ModuleCode)) {
      await prisma.moduleDefinition.upsert({
        where: { code },
        create: {
          code,
          label: code,
          isRequired: code === ModuleCode.MEMBERS,
        },
        update: { isRequired: code === ModuleCode.MEMBERS },
      });
    }

    clubId = randomUUID();
    await prisma.club.create({
      data: {
        id: clubId,
        name: 'E2E Club',
        slug: `e2e-${clubId.slice(0, 8)}`,
      },
    });

    const adminHash = await bcrypt.hash(adminPassword, 8);
    const staffHash = await bcrypt.hash(staffPassword, 8);

    await prisma.user.create({
      data: {
        id: randomUUID(),
        email: adminEmail,
        passwordHash: adminHash,
        displayName: 'E2E Admin',
        memberships: {
          create: {
            id: randomUUID(),
            clubId,
            role: MembershipRole.CLUB_ADMIN,
          },
        },
      },
    });

    await prisma.user.create({
      data: {
        id: randomUUID(),
        email: staffEmail,
        passwordHash: staffHash,
        displayName: 'E2E Staff',
        memberships: {
          create: {
            id: randomUUID(),
            clubId,
            role: MembershipRole.STAFF,
          },
        },
      },
    });

    await prisma.clubModule.create({
      data: {
        id: randomUUID(),
        clubId,
        moduleCode: ModuleCode.MEMBERS,
        enabled: true,
        enabledAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    try {
      if (clubId) {
        await prisma.clubModule.deleteMany({ where: { clubId } });
        await prisma.clubMembership.deleteMany({ where: { clubId } });
        await prisma.club.delete({ where: { id: clubId } });
        await prisma.user.deleteMany({
          where: { email: { in: [adminEmail, staffEmail] } },
        });
      }
    } catch {
      // Nettoyage best-effort si la base n’a jamais été joignable
    }
    await app.close();
  });

  function gql(query: string, variables?: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/graphql')
      .send({ query, variables });
  }

  it('login retourne un token', async () => {
    const res = await gql(
      `mutation ($input: LoginInput!) {
        login(input: $input) { accessToken }
      }`,
      { input: { email: adminEmail, password: adminPassword } },
    );
    expect(res.status).toBe(200);
    expect(res.body.data?.login?.accessToken).toBeDefined();
  });

  it('adminDashboardSummary sans X-Club-Id échoue', async () => {
    const login = await gql(
      `mutation ($input: LoginInput!) { login(input: $input) { accessToken } }`,
      { input: { email: adminEmail, password: adminPassword } },
    );
    const token = login.body.data.login.accessToken as string;
    const res = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({
        query: `{ adminDashboardSummary { activeMembersCount } }`,
      });
    expect(res.status).toBe(200);
    expect(res.body.errors?.length).toBeGreaterThan(0);
  });

  it('adminDashboardSummary avec en-têtes retourne des compteurs cohérents', async () => {
    const login = await gql(
      `mutation ($input: LoginInput!) { login(input: $input) { accessToken } }`,
      { input: { email: adminEmail, password: adminPassword } },
    );
    const token = login.body.data.login.accessToken as string;
    const res = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .set('x-club-id', clubId as string)
      .send({
        query: `{
          adminDashboardSummary {
            activeMembersCount
            activeModulesCount
            upcomingSessionsCount
          }
        }`,
      });
    expect(res.status).toBe(200);
    expect(res.body.errors).toBeUndefined();
    expect(res.body.data.adminDashboardSummary.activeMembersCount).toBe(2);
    expect(res.body.data.adminDashboardSummary.activeModulesCount).toBe(1);
    expect(res.body.data.adminDashboardSummary.upcomingSessionsCount).toBe(0);
  });

  it('utilisateur STAFF reçoit Forbidden sur le dashboard', async () => {
    const login = await gql(
      `mutation ($input: LoginInput!) { login(input: $input) { accessToken } }`,
      { input: { email: staffEmail, password: staffPassword } },
    );
    const token = login.body.data.login.accessToken as string;
    const res = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .set('x-club-id', clubId as string)
      .send({
        query: `{ adminDashboardSummary { activeMembersCount } }`,
      });
    expect(res.status).toBe(200);
    expect(res.body.errors?.[0]?.message).toMatch(/Forbidden/i);
  });

  it('activation BLOG sans WEBSITE retourne une erreur métier', async () => {
    const login = await gql(
      `mutation ($input: LoginInput!) { login(input: $input) { accessToken } }`,
      { input: { email: adminEmail, password: adminPassword } },
    );
    const token = login.body.data.login.accessToken as string;
    const res = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .set('x-club-id', clubId as string)
      .send({
        query: `mutation {
          setClubModuleEnabled(moduleCode: BLOG, enabled: true) { id enabled }
        }`,
      });
    expect(res.status).toBe(200);
    expect(
      res.body.errors?.some(
        (e: { message?: string }) =>
          typeof e.message === 'string' && e.message.includes('WEBSITE'),
      ),
    ).toBe(true);
  });
});
