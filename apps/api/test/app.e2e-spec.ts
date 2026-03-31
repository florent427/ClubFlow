import { execSync } from 'child_process';
import { join } from 'path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import {
  PrismaClient,
  FamilyMemberLinkRole,
  InvoiceStatus,
  MemberCivility,
  MemberClubRole,
  MemberStatus,
  MembershipRole,
} from '@prisma/client';
import { ModuleCode } from '../src/domain/module-registry/module-codes';
import { EmailVerificationService } from '../src/auth/email-verification.service';

describe('ClubFlow API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const adminEmail = 'e2e-admin@clubflow.test';
  const adminPassword = 'E2eAdmin!pass';
  const staffEmail = 'e2e-staff@clubflow.test';
  const staffPassword = 'E2eStaff!pass';
  const memberPortalEmail = 'e2e-member-portal@clubflow.test';
  const memberPortalPassword = 'E2ePortal!pass';

  let clubId: string | undefined;

  beforeAll(async () => {
    execSync('npx prisma migrate deploy', {
      cwd: join(__dirname, '..'),
      stdio: 'inherit',
      env: process.env,
    });

    clubId = randomUUID();
    const pc = new PrismaClient();
    await pc.club.create({
      data: {
        id: clubId,
        name: 'E2E Club',
        slug: `e2e-${clubId.slice(0, 8)}`,
      },
    });
    await pc.clubSendingDomain.create({
      data: {
        id: randomUUID(),
        clubId: clubId as string,
        fqdn: 'e2e-mail.test.invalid',
        purpose: 'TRANSACTIONAL',
        verificationStatus: 'VERIFIED',
      },
    });
    process.env.CLUB_ID = clubId;
    await pc.$disconnect();

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

    const adminHash = await bcrypt.hash(adminPassword, 8);
    const staffHash = await bcrypt.hash(staffPassword, 8);

    await prisma.user.deleteMany({
      where: { email: { in: [adminEmail, staffEmail] } },
    });

    await prisma.user.create({
      data: {
        id: randomUUID(),
        email: adminEmail,
        passwordHash: adminHash,
        emailVerifiedAt: new Date(),
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
        emailVerifiedAt: new Date(),
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

    await prisma.clubModule.create({
      data: {
        id: randomUUID(),
        clubId,
        moduleCode: ModuleCode.FAMILIES,
        enabled: true,
        enabledAt: new Date(),
      },
    });

    await prisma.clubModule.create({
      data: {
        id: randomUUID(),
        clubId,
        moduleCode: ModuleCode.PLANNING,
        enabled: true,
        enabledAt: new Date(),
      },
    });

    for (const code of [
      ModuleCode.PAYMENT,
      ModuleCode.ACCOUNTING,
      ModuleCode.COMMUNICATION,
      ModuleCode.SUBSIDIES,
      ModuleCode.SPONSORING,
    ] as const) {
      await prisma.clubModule.create({
        data: {
          id: randomUUID(),
          clubId,
          moduleCode: code,
          enabled: true,
          enabledAt: new Date(),
        },
      });
    }
  });

  afterAll(async () => {
    try {
      if (clubId) {
        await prisma.messageCampaignRecipient.deleteMany({
          where: { campaign: { clubId } },
        });
        await prisma.messageCampaign.deleteMany({ where: { clubId } });
        await prisma.clubSendingDomain.deleteMany({ where: { clubId } });
        await prisma.accountingEntry.deleteMany({ where: { clubId } });
        await prisma.payment.deleteMany({ where: { clubId } });
        await prisma.invoice.deleteMany({ where: { clubId } });
        await prisma.clubPricingRule.deleteMany({ where: { clubId } });
        await prisma.grantApplication.deleteMany({ where: { clubId } });
        await prisma.sponsorshipDeal.deleteMany({ where: { clubId } });
        await prisma.courseSlot.deleteMany({ where: { clubId } });
        await prisma.venue.deleteMany({ where: { clubId } });
        await prisma.family.deleteMany({ where: { clubId } });
        await prisma.member.deleteMany({ where: { clubId } });
        await prisma.clubRoleDefinition.deleteMany({ where: { clubId } });
        await prisma.dynamicGroup.deleteMany({ where: { clubId } });
        await prisma.gradeLevel.deleteMany({ where: { clubId } });
        await prisma.clubModule.deleteMany({ where: { clubId } });
        await prisma.clubMembership.deleteMany({ where: { clubId } });
        await prisma.club.delete({ where: { id: clubId } });
        await prisma.user.deleteMany({
          where: {
            email: { in: [adminEmail, staffEmail, memberPortalEmail] },
          },
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

  it('contact : registerContact puis verifyEmail retourne accessToken', async () => {
    const email = `e2e-register-${randomUUID()}@test.invalid`;
    const reg = await gql(
      `mutation ($i: RegisterContactInput!) {
        registerContact(input: $i) { ok }
      }`,
      {
        i: {
          email,
          password: 'longpassword1',
          firstName: 'E2E',
          lastName: 'Contact',
        },
      },
    );
    expect(reg.status).toBe(200);
    expect(reg.body.errors).toBeUndefined();
    expect(reg.body.data.registerContact.ok).toBe(true);

    const userRow = await prisma.user.findUnique({ where: { email } });
    expect(userRow).toBeTruthy();

    const ev = app.get(EmailVerificationService);
    const raw = await ev.issueTokenForUser(userRow!.id);

    const ver = await gql(
      `mutation ($i: VerifyEmailInput!) {
        verifyEmail(input: $i) {
          accessToken
          contactClubId
          viewerProfiles { memberId }
        }
      }`,
      { i: { token: raw } },
    );
    expect(ver.status).toBe(200);
    expect(ver.body.errors).toBeUndefined();
    expect(ver.body.data.verifyEmail.accessToken).toBeDefined();
    expect(ver.body.data.verifyEmail.contactClubId).toBe(clubId);
    expect(ver.body.data.verifyEmail.viewerProfiles).toEqual([]);

    await prisma.user.delete({ where: { id: userRow!.id } });
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
    expect(res.body.data.adminDashboardSummary.activeMembersCount).toBe(0);
    expect(res.body.data.adminDashboardSummary.activeModulesCount).toBe(8);
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

  it('création membre + grade : tableau de bord compte les actifs', async () => {
    const login = await gql(
      `mutation ($input: LoginInput!) { login(input: $input) { accessToken } }`,
      { input: { email: adminEmail, password: adminPassword } },
    );
    const token = login.body.data.login.accessToken as string;
    const h = () => ({
      Authorization: `Bearer ${token}`,
      'x-club-id': clubId as string,
    });

    const gradeRes = await request(app.getHttpServer())
      .post('/graphql')
      .set(h())
      .send({
        query: `mutation ($input: CreateGradeLevelInput!) {
          createClubGradeLevel(input: $input) { id label }
        }`,
        variables: { input: { label: 'Ceinture blanche', sortOrder: 0 } },
      });
    expect(gradeRes.status).toBe(200);
    expect(gradeRes.body.errors).toBeUndefined();
    const gradeId = gradeRes.body.data.createClubGradeLevel.id as string;

    const memberRes = await request(app.getHttpServer())
      .post('/graphql')
      .set(h())
      .send({
        query: `mutation ($input: CreateMemberInput!) {
          createClubMember(input: $input) {
            id
            firstName
            gradeLevelId
            roles
          }
        }`,
        variables: {
          input: {
            firstName: 'Léa',
            lastName: 'E2E',
            civility: 'MR',
            email: 'lea.e2e@test.invalid',
            birthDate: '2015-01-15',
            gradeLevelId: gradeId,
          },
        },
      });
    expect(memberRes.status).toBe(200);
    expect(memberRes.body.errors).toBeUndefined();
    expect(memberRes.body.data.createClubMember.roles).toContain('STUDENT');

    const dashRes = await request(app.getHttpServer())
      .post('/graphql')
      .set(h())
      .send({
        query: `{ adminDashboardSummary { activeMembersCount } }`,
      });
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.errors).toBeUndefined();
    expect(dashRes.body.data.adminDashboardSummary.activeMembersCount).toBe(1);
  });

  it('Phase C : foyer + login expose les profils visionneur', async () => {
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: adminEmail },
    });
    const parentId = randomUUID();
    const childId = randomUUID();
    await prisma.member.create({
      data: {
        id: parentId,
        clubId: clubId as string,
        userId: admin.id,
        firstName: 'Parent',
        lastName: 'E2E',
        civility: MemberCivility.MR,
        email: `e2e-parent-${parentId}@test.invalid`,
        status: MemberStatus.ACTIVE,
        roleAssignments: {
          create: { role: MemberClubRole.STUDENT },
        },
      },
    });
    await prisma.member.create({
      data: {
        id: childId,
        clubId: clubId as string,
        firstName: 'Enfant',
        lastName: 'E2E',
        civility: MemberCivility.MME,
        email: `e2e-enfant-${childId}@test.invalid`,
        status: MemberStatus.ACTIVE,
        roleAssignments: {
          create: { role: MemberClubRole.STUDENT },
        },
      },
    });

    const login = await gql(
      `mutation ($input: LoginInput!) { login(input: $input) { accessToken } }`,
      { input: { email: adminEmail, password: adminPassword } },
    );
    const token = login.body.data.login.accessToken as string;

    const famRes = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .set('x-club-id', clubId as string)
      .send({
        query: `mutation ($input: CreateClubFamilyInput!) {
          createClubFamily(input: $input) {
            id
            links { memberId linkRole }
          }
        }`,
        variables: {
          input: {
            label: 'Foyer E2E',
            payerMemberId: parentId,
            memberIds: [parentId, childId],
          },
        },
      });
    expect(famRes.status).toBe(200);
    expect(famRes.body.errors).toBeUndefined();
    const payers = famRes.body.data.createClubFamily.links.filter(
      (l: { linkRole: string }) => l.linkRole === 'PAYER',
    );
    expect(payers).toHaveLength(1);

    const loginProfiles = await gql(
      `mutation ($input: LoginInput!) {
        login(input: $input) {
          accessToken
          viewerProfiles { memberId isPrimaryProfile familyId }
        }
      }`,
      { input: { email: adminEmail, password: adminPassword } },
    );
    expect(loginProfiles.status).toBe(200);
    expect(loginProfiles.body.errors).toBeUndefined();
    const profiles =
      loginProfiles.body.data.login.viewerProfiles as {
        memberId: string;
        isPrimaryProfile: boolean;
      }[];
    expect(profiles.length).toBeGreaterThanOrEqual(2);
    expect(profiles.some((p) => p.memberId === parentId && p.isPrimaryProfile)).toBe(
      true,
    );

    const dupRes = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .set('x-club-id', clubId as string)
      .send({
        query: `mutation ($input: CreateClubFamilyInput!) {
          createClubFamily(input: $input) { id }
        }`,
        variables: {
          input: {
            payerMemberId: parentId,
            memberIds: [parentId, childId],
          },
        },
      });
    expect(dupRes.status).toBe(200);
    expect(dupRes.body.errors?.length).toBeGreaterThan(0);

    const profileToken = loginProfiles.body.data.login.accessToken as string;
    const switchRes = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${profileToken}`)
      .send({
        query: `mutation {
          selectActiveViewerProfile(memberId: "${childId}") {
            accessToken
            viewerProfiles { memberId }
          }
        }`,
      });
    expect(switchRes.status).toBe(200);
    expect(switchRes.body.errors).toBeUndefined();
    const newTok = switchRes.body.data.selectActiveViewerProfile
      .accessToken as string;
    const part = newTok.split('.')[1];
    expect(part).toBeDefined();
    const b64 = (part as string).replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(
      Buffer.from(pad, 'base64').toString('utf8'),
    ) as { activeProfileMemberId?: string };
    expect(payload.activeProfileMemberId).toBe(childId);

    await prisma.family.deleteMany({ where: { clubId: clubId as string } });
    await prisma.member.deleteMany({
      where: { id: { in: [parentId, childId] } },
    });
  });

  it('Familles : transfert, détachement payeur, needsPayer, setClubFamilyPayer', async () => {
    const pId = randomUUID();
    const kId = randomUUID();
    const oId = randomUUID();
    await prisma.member.create({
      data: {
        id: pId,
        clubId: clubId as string,
        firstName: 'Payeur',
        lastName: 'E2ETransfert',
        civility: MemberCivility.MR,
        email: `e2e-${pId}@test.invalid`,
        status: MemberStatus.ACTIVE,
        roleAssignments: { create: { role: MemberClubRole.STUDENT } },
      },
    });
    await prisma.member.create({
      data: {
        id: kId,
        clubId: clubId as string,
        firstName: 'Enfant',
        lastName: 'E2ETransfert',
        civility: MemberCivility.MME,
        email: `e2e-${kId}@test.invalid`,
        status: MemberStatus.ACTIVE,
        roleAssignments: { create: { role: MemberClubRole.STUDENT } },
      },
    });
    await prisma.member.create({
      data: {
        id: oId,
        clubId: clubId as string,
        firstName: 'Orphelin',
        lastName: 'E2ETransfert',
        civility: MemberCivility.MR,
        email: `e2e-${oId}@test.invalid`,
        status: MemberStatus.ACTIVE,
        roleAssignments: { create: { role: MemberClubRole.STUDENT } },
      },
    });

    const login = await gql(
      `mutation ($input: LoginInput!) { login(input: $input) { accessToken } }`,
      { input: { email: adminEmail, password: adminPassword } },
    );
    const token = login.body.data.login.accessToken as string;
    const headers = {
      Authorization: `Bearer ${token}`,
      'x-club-id': clubId as string,
    };

    const createFam = await request(app.getHttpServer())
      .post('/graphql')
      .set(headers)
      .send({
        query: `mutation ($input: CreateClubFamilyInput!) {
          createClubFamily(input: $input) {
            id
            needsPayer
            links { memberId linkRole }
          }
        }`,
        variables: {
          input: {
            label: 'Foyer transfert E2E',
            payerMemberId: pId,
            memberIds: [pId, kId],
          },
        },
      });
    expect(createFam.status).toBe(200);
    expect(createFam.body.errors).toBeUndefined();
    expect(createFam.body.data.createClubFamily.needsPayer).toBe(false);
    const familyId = createFam.body.data.createClubFamily.id as string;

    const transferRes = await request(app.getHttpServer())
      .post('/graphql')
      .set(headers)
      .send({
        query: `mutation ($memberId: ID!, $familyId: ID!) {
          transferClubMemberToFamily(
            memberId: $memberId
            familyId: $familyId
            linkRole: MEMBER
          ) {
            id
            needsPayer
            links { memberId linkRole }
          }
        }`,
        variables: { memberId: oId, familyId },
      });
    expect(transferRes.status).toBe(200);
    expect(transferRes.body.errors).toBeUndefined();
    const linksAfterTransfer = transferRes.body.data.transferClubMemberToFamily
      .links as { memberId: string }[];
    expect(linksAfterTransfer.map((l) => l.memberId).sort()).toEqual(
      [kId, oId, pId].sort(),
    );

    const removeRes = await request(app.getHttpServer())
      .post('/graphql')
      .set(headers)
      .send({
        query: `mutation ($memberId: ID!) {
          removeClubMemberFromFamily(memberId: $memberId)
        }`,
        variables: { memberId: pId },
      });
    expect(removeRes.status).toBe(200);
    expect(removeRes.body.errors).toBeUndefined();
    expect(removeRes.body.data.removeClubMemberFromFamily).toBe(true);

    const listRes = await request(app.getHttpServer())
      .post('/graphql')
      .set(headers)
      .send({
        query: `{ clubFamilies { id needsPayer links { memberId linkRole } } }`,
      });
    expect(listRes.status).toBe(200);
    expect(listRes.body.errors).toBeUndefined();
    const famRow = listRes.body.data.clubFamilies.find(
      (f: { id: string }) => f.id === familyId,
    );
    expect(famRow.needsPayer).toBe(true);
    const payersAfterRemove = famRow.links.filter(
      (l: { linkRole: string }) => l.linkRole === 'PAYER',
    );
    expect(payersAfterRemove).toHaveLength(0);

    const setPayRes = await request(app.getHttpServer())
      .post('/graphql')
      .set(headers)
      .send({
        query: `mutation ($memberId: ID!) {
          setClubFamilyPayer(memberId: $memberId) {
            id
            needsPayer
            links { memberId linkRole }
          }
        }`,
        variables: { memberId: kId },
      });
    expect(setPayRes.status).toBe(200);
    expect(setPayRes.body.errors).toBeUndefined();
    expect(setPayRes.body.data.setClubFamilyPayer.needsPayer).toBe(false);
    const payersAfterSet = setPayRes.body.data.setClubFamilyPayer.links.filter(
      (l: { linkRole: string }) => l.linkRole === 'PAYER',
    );
    expect(payersAfterSet).toHaveLength(1);
    expect(payersAfterSet[0].memberId).toBe(kId);

    await prisma.family.deleteMany({ where: { id: familyId } });
    await prisma.member.deleteMany({
      where: { id: { in: [pId, kId, oId] } },
    });
  });

  it('updateClubFamily met à jour le libellé', async () => {
    const mId = randomUUID();
    await prisma.member.create({
      data: {
        id: mId,
        clubId: clubId as string,
        firstName: 'Solo',
        lastName: 'E2ELabel',
        civility: MemberCivility.MME,
        email: `e2e-${mId}@test.invalid`,
        status: MemberStatus.ACTIVE,
        roleAssignments: { create: { role: MemberClubRole.STUDENT } },
      },
    });
    const login = await gql(
      `mutation ($input: LoginInput!) { login(input: $input) { accessToken } }`,
      { input: { email: adminEmail, password: adminPassword } },
    );
    const token = login.body.data.login.accessToken as string;
    const headers = {
      Authorization: `Bearer ${token}`,
      'x-club-id': clubId as string,
    };
    const createRes = await request(app.getHttpServer())
      .post('/graphql')
      .set(headers)
      .send({
        query: `mutation ($input: CreateClubFamilyInput!) {
          createClubFamily(input: $input) { id label }
        }`,
        variables: {
          input: {
            label: 'Libellé initial',
            payerMemberId: mId,
            memberIds: [mId],
          },
        },
      });
    expect(createRes.status).toBe(200);
    expect(createRes.body.errors).toBeUndefined();
    const fid = createRes.body.data.createClubFamily.id as string;

    const upd = await request(app.getHttpServer())
      .post('/graphql')
      .set(headers)
      .send({
        query: `mutation ($input: UpdateClubFamilyInput!) {
          updateClubFamily(input: $input) { id label }
        }`,
        variables: {
          input: { id: fid, label: 'Libellé modifié' },
        },
      });
    expect(upd.status).toBe(200);
    expect(upd.body.errors).toBeUndefined();
    expect(upd.body.data.updateClubFamily.label).toBe('Libellé modifié');

    await prisma.family.deleteMany({ where: { id: fid } });
    await prisma.member.deleteMany({ where: { id: mId } });
  });

  it('Phase D Planning : conflit professeur et séances à venir au dashboard', async () => {
    const login = await gql(
      `mutation ($input: LoginInput!) { login(input: $input) { accessToken } }`,
      { input: { email: adminEmail, password: adminPassword } },
    );
    const token = login.body.data.login.accessToken as string;
    const headers = {
      Authorization: `Bearer ${token}`,
      'x-club-id': clubId as string,
    };

    const venue = await prisma.venue.create({
      data: { clubId: clubId as string, name: 'Dojo e2e' },
    });
    const coachId = randomUUID();
    await prisma.member.create({
      data: {
        id: coachId,
        clubId: clubId as string,
        firstName: 'Sensei',
        lastName: 'E2E',
        civility: MemberCivility.MR,
        email: `e2e-coach-${coachId}@test.invalid`,
        status: MemberStatus.ACTIVE,
        roleAssignments: { create: { role: MemberClubRole.COACH } },
      },
    });

    const start1 = new Date(Date.now() + 2 * 86400000);
    start1.setUTCHours(14, 0, 0, 0);
    const end1 = new Date(start1.getTime() + 60 * 60 * 1000);
    const start2 = new Date(start1.getTime() + 30 * 60 * 1000);
    const end2 = new Date(start1.getTime() + 90 * 60 * 1000);

    const first = await request(app.getHttpServer())
      .post('/graphql')
      .set(headers)
      .send({
        query: `mutation ($input: CreateCourseSlotInput!) {
          createClubCourseSlot(input: $input) { id }
        }`,
        variables: {
          input: {
            venueId: venue.id,
            coachMemberId: coachId,
            title: 'Karaté débutants',
            startsAt: start1.toISOString(),
            endsAt: end1.toISOString(),
          },
        },
      });
    expect(first.status).toBe(200);
    expect(first.body.errors).toBeUndefined();

    const clash = await request(app.getHttpServer())
      .post('/graphql')
      .set(headers)
      .send({
        query: `mutation ($input: CreateCourseSlotInput!) {
          createClubCourseSlot(input: $input) { id }
        }`,
        variables: {
          input: {
            venueId: venue.id,
            coachMemberId: coachId,
            title: 'Chevauchement',
            startsAt: start2.toISOString(),
            endsAt: end2.toISOString(),
          },
        },
      });
    expect(clash.status).toBe(200);
    expect(clash.body.errors?.length).toBeGreaterThan(0);
    expect(
      clash.body.errors.some((e: { message?: string }) =>
        String(e.message).toLowerCase().includes('conflit'),
      ),
    ).toBe(true);

    const dash = await request(app.getHttpServer())
      .post('/graphql')
      .set(headers)
      .send({
        query: `{ adminDashboardSummary { upcomingSessionsCount } }`,
      });
    expect(dash.status).toBe(200);
    expect(dash.body.errors).toBeUndefined();
    expect(
      dash.body.data.adminDashboardSummary.upcomingSessionsCount,
    ).toBeGreaterThanOrEqual(1);

    await prisma.courseSlot.deleteMany({ where: { clubId: clubId as string } });
    await prisma.venue.delete({ where: { id: venue.id } });
    await prisma.member.delete({ where: { id: coachId } });
  });

  it('Portail viewer : viewerMe, créneaux et fact famille (payeur vs enfant)', async () => {
    await prisma.user.deleteMany({ where: { email: memberPortalEmail } });

    const portalUserId = randomUUID();
    const payerId = randomUUID();
    const childId = randomUUID();
    const coachId = randomUUID();
    const portalHash = await bcrypt.hash(memberPortalPassword, 8);

    await prisma.user.create({
      data: {
        id: portalUserId,
        email: memberPortalEmail,
        passwordHash: portalHash,
        emailVerifiedAt: new Date(),
        displayName: 'E2E Portail',
      },
    });

    await prisma.member.create({
      data: {
        id: payerId,
        clubId: clubId as string,
        userId: portalUserId,
        firstName: 'Payeur',
        lastName: 'Portail',
        civility: MemberCivility.MR,
        email: `e2e-payer-portail-${payerId}@test.invalid`,
        status: MemberStatus.ACTIVE,
        roleAssignments: { create: { role: MemberClubRole.STUDENT } },
      },
    });
    await prisma.member.create({
      data: {
        id: childId,
        clubId: clubId as string,
        firstName: 'Enfant',
        lastName: 'Portail',
        civility: MemberCivility.MME,
        email: `e2e-enfant-portail-${childId}@test.invalid`,
        status: MemberStatus.ACTIVE,
        roleAssignments: { create: { role: MemberClubRole.STUDENT } },
      },
    });

    const family = await prisma.family.create({
      data: {
        clubId: clubId as string,
        label: 'Foyer portail e2e',
        familyMembers: {
          create: [
            { memberId: payerId, linkRole: FamilyMemberLinkRole.PAYER },
            { memberId: childId, linkRole: FamilyMemberLinkRole.MEMBER },
          ],
        },
      },
    });

    const venue = await prisma.venue.create({
      data: { clubId: clubId as string, name: 'Dojo portail' },
    });
    await prisma.member.create({
      data: {
        id: coachId,
        clubId: clubId as string,
        firstName: 'Coach',
        lastName: 'Portail',
        civility: MemberCivility.MR,
        email: `e2e-coach-portail-${coachId}@test.invalid`,
        status: MemberStatus.ACTIVE,
        roleAssignments: { create: { role: MemberClubRole.COACH } },
      },
    });

    const startsAt = new Date(Date.now() + 3 * 86400000);
    startsAt.setUTCHours(10, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 3600000);

    await prisma.courseSlot.create({
      data: {
        clubId: clubId as string,
        venueId: venue.id,
        coachMemberId: coachId,
        title: 'Cours portail e2e',
        startsAt,
        endsAt,
        dynamicGroupId: null,
      },
    });

    await prisma.invoice.create({
      data: {
        clubId: clubId as string,
        familyId: family.id,
        label: 'Adhésion portail',
        baseAmountCents: 5000,
        amountCents: 5000,
        status: InvoiceStatus.OPEN,
      },
    });

    const loginRes = await gql(
      `mutation ($input: LoginInput!) {
        login(input: $input) {
          accessToken
          viewerProfiles { memberId isPrimaryProfile }
        }
      }`,
      { input: { email: memberPortalEmail, password: memberPortalPassword } },
    );
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.errors).toBeUndefined();
    let token = loginRes.body.data.login.accessToken as string;
    const profiles = loginRes.body.data.login.viewerProfiles as {
      memberId: string;
      isPrimaryProfile: boolean;
    }[];
    expect(profiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          memberId: payerId,
          isPrimaryProfile: true,
        }),
        expect.objectContaining({
          memberId: childId,
          isPrimaryProfile: false,
        }),
      ]),
    );

    const meRes = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .set('x-club-id', clubId as string)
      .send({
        query: `{ viewerMe { firstName lastName gradeLevelLabel } }`,
      });
    expect(meRes.status).toBe(200);
    expect(meRes.body.errors).toBeUndefined();
    expect(meRes.body.data.viewerMe.firstName).toBe('Payeur');

    const slotsRes = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .set('x-club-id', clubId as string)
      .send({
        query: `{ viewerUpcomingCourseSlots { title venueName coachFirstName } }`,
      });
    expect(slotsRes.status).toBe(200);
    expect(slotsRes.body.errors).toBeUndefined();
    expect(
      slotsRes.body.data.viewerUpcomingCourseSlots.length,
    ).toBeGreaterThanOrEqual(1);
    expect(slotsRes.body.data.viewerUpcomingCourseSlots[0].title).toBe(
      'Cours portail e2e',
    );
    expect(slotsRes.body.data.viewerUpcomingCourseSlots[0].venueName).toBe(
      'Dojo portail',
    );

    const billPayer = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .set('x-club-id', clubId as string)
      .send({
        query: `{
          viewerFamilyBillingSummary {
            isPayerView
            familyLabel
            invoices { label balanceCents }
            familyMembers { firstName memberId }
          }
        }`,
      });
    expect(billPayer.status).toBe(200);
    expect(billPayer.body.errors).toBeUndefined();
    const sumPayer = billPayer.body.data.viewerFamilyBillingSummary;
    expect(sumPayer.isPayerView).toBe(true);
    expect(sumPayer.familyLabel).toBe('Foyer portail e2e');
    expect(sumPayer.invoices).toHaveLength(1);
    expect(sumPayer.invoices[0].label).toBe('Adhésion portail');
    expect(sumPayer.invoices[0].balanceCents).toBe(5000);
    expect(sumPayer.familyMembers.length).toBe(2);

    const switchRes = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({
        query: `mutation {
          selectActiveViewerProfile(memberId: "${childId}") { accessToken }
        }`,
      });
    expect(switchRes.status).toBe(200);
    expect(switchRes.body.errors).toBeUndefined();
    token = switchRes.body.data.selectActiveViewerProfile.accessToken as string;

    const meChild = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .set('x-club-id', clubId as string)
      .send({ query: `{ viewerMe { firstName } }` });
    expect(meChild.status).toBe(200);
    expect(meChild.body.errors).toBeUndefined();
    expect(meChild.body.data.viewerMe.firstName).toBe('Enfant');

    const billChild = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .set('x-club-id', clubId as string)
      .send({
        query: `{
          viewerFamilyBillingSummary { isPayerView invoices { id } }
        }`,
      });
    expect(billChild.status).toBe(200);
    expect(billChild.body.errors).toBeUndefined();
    expect(billChild.body.data.viewerFamilyBillingSummary.isPayerView).toBe(
      false,
    );
    expect(
      billChild.body.data.viewerFamilyBillingSummary.invoices,
    ).toHaveLength(0);

    await prisma.invoice.deleteMany({ where: { familyId: family.id } });
    await prisma.courseSlot.deleteMany({
      where: {
        clubId: clubId as string,
        title: 'Cours portail e2e',
      },
    });
    await prisma.venue.delete({ where: { id: venue.id } });
    await prisma.family.delete({ where: { id: family.id } });
    await prisma.member.deleteMany({
      where: { id: { in: [payerId, childId, coachId] } },
    });
    await prisma.user.delete({ where: { id: portalUserId } });
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

  it('Phases E–F–G : facture, encaissement manuel, dashboard, compta, communication, finance externe', async () => {
    const login = await gql(
      `mutation ($input: LoginInput!) { login(input: $input) { accessToken } }`,
      { input: { email: adminEmail, password: adminPassword } },
    );
    const token = login.body.data.login.accessToken as string;
    const headers = {
      Authorization: `Bearer ${token}`,
      'x-club-id': clubId as string,
    };

    const before = await request(app.getHttpServer())
      .post('/graphql')
      .set(headers)
      .send({
        query: `{
          adminDashboardSummary {
            outstandingPaymentsCount
            revenueCentsMonth
          }
        }`,
      });
    expect(before.status).toBe(200);
    expect(before.body.errors).toBeUndefined();
    const out0 =
      before.body.data.adminDashboardSummary.outstandingPaymentsCount as number;

    const invRes = await request(app.getHttpServer())
      .post('/graphql')
      .set(headers)
      .send({
        query: `mutation ($input: CreateInvoiceInput!) {
          createClubInvoice(input: $input) { id amountCents status }
        }`,
        variables: {
          input: {
            label: 'E2E phase EFG',
            baseAmountCents: 10000,
            pricingMethod: 'MANUAL_CASH',
          },
        },
      });
    expect(invRes.status).toBe(200);
    expect(invRes.body.errors).toBeUndefined();
    const invoiceId = invRes.body.data.createClubInvoice.id as string;
    const amountCents = invRes.body.data.createClubInvoice.amountCents as number;

    const mid = await request(app.getHttpServer())
      .post('/graphql')
      .set(headers)
      .send({
        query: `{ adminDashboardSummary { outstandingPaymentsCount } }`,
      });
    expect(mid.status).toBe(200);
    expect(mid.body.errors).toBeUndefined();
    expect(
      mid.body.data.adminDashboardSummary.outstandingPaymentsCount,
    ).toBe(out0 + 1);

    const payRes = await request(app.getHttpServer())
      .post('/graphql')
      .set(headers)
      .send({
        query: `mutation ($input: RecordManualPaymentInput!) {
          recordClubManualPayment(input: $input) { id amountCents }
        }`,
        variables: {
          input: {
            invoiceId,
            amountCents,
            method: 'MANUAL_CASH',
          },
        },
      });
    expect(payRes.status).toBe(200);
    expect(payRes.body.errors).toBeUndefined();

    const after = await request(app.getHttpServer())
      .post('/graphql')
      .set(headers)
      .send({
        query: `{ adminDashboardSummary {
          outstandingPaymentsCount
          revenueCentsMonth
        } }`,
      });
    expect(after.status).toBe(200);
    expect(after.body.errors).toBeUndefined();
    expect(
      after.body.data.adminDashboardSummary.outstandingPaymentsCount,
    ).toBe(out0);
    expect(
      after.body.data.adminDashboardSummary.revenueCentsMonth,
    ).toBeGreaterThanOrEqual(amountCents);

    const accRes = await request(app.getHttpServer())
      .post('/graphql')
      .set(headers)
      .send({
        query: `{ clubAccountingEntries { id kind amountCents } }`,
      });
    expect(accRes.status).toBe(200);
    expect(accRes.body.errors).toBeUndefined();
    expect(accRes.body.data.clubAccountingEntries.length).toBeGreaterThan(0);

    const campRes = await request(app.getHttpServer())
      .post('/graphql')
      .set(headers)
      .send({
        query: `mutation ($input: CreateMessageCampaignInput!) {
          createClubMessageCampaign(input: $input) { id status }
        }`,
        variables: {
          input: {
            title: 'E2E campagne',
            body: 'Message de test',
            /** PUSH évite la chaîne e-mail / domaine vérifié (cf. campagnes EMAIL). */
            channel: 'PUSH',
          },
        },
      });
    expect(campRes.status).toBe(200);
    expect(campRes.body.errors).toBeUndefined();
    const campId = campRes.body.data.createClubMessageCampaign.id as string;

    const sendRes = await request(app.getHttpServer())
      .post('/graphql')
      .set(headers)
      .send({
        query: `mutation { sendClubMessageCampaign(campaignId: "${campId}") { status recipientCount } }`,
      });
    expect(sendRes.status).toBe(200);
    expect(sendRes.body.errors).toBeUndefined();
    expect(sendRes.body.data.sendClubMessageCampaign.status).toBe('SENT');

    const grantRes = await request(app.getHttpServer())
      .post('/graphql')
      .set(headers)
      .send({
        query: `mutation ($input: CreateGrantApplicationInput!) {
          createClubGrantApplication(input: $input) { id title status }
        }`,
        variables: {
          input: { title: 'E2E subvention', amountCents: 50_000 },
        },
      });
    expect(grantRes.status).toBe(200);
    expect(grantRes.body.errors).toBeUndefined();

    const spoRes = await request(app.getHttpServer())
      .post('/graphql')
      .set(headers)
      .send({
        query: `mutation ($input: CreateSponsorshipDealInput!) {
          createClubSponsorshipDeal(input: $input) { id sponsorName }
        }`,
        variables: {
          input: { sponsorName: 'E2E Sponsor', amountCents: 25_000 },
        },
      });
    expect(spoRes.status).toBe(200);
    expect(spoRes.body.errors).toBeUndefined();

    await prisma.messageCampaignRecipient.deleteMany({
      where: { campaign: { clubId: clubId as string, title: 'E2E campagne' } },
    });
    await prisma.messageCampaign.deleteMany({
      where: { clubId: clubId as string, title: 'E2E campagne' },
    });
    await prisma.grantApplication.deleteMany({
      where: { clubId: clubId as string, title: 'E2E subvention' },
    });
    await prisma.sponsorshipDeal.deleteMany({
      where: { clubId: clubId as string, sponsorName: 'E2E Sponsor' },
    });
    await prisma.accountingEntry.deleteMany({
      where: { clubId: clubId as string },
    });
    await prisma.payment.deleteMany({ where: { clubId: clubId as string } });
    await prisma.invoice.deleteMany({ where: { clubId: clubId as string } });
  });

  it('Phase E : paiement manuel partiel puis solde (soldes facture)', async () => {
    const login = await gql(
      `mutation ($input: LoginInput!) { login(input: $input) { accessToken } }`,
      { input: { email: adminEmail, password: adminPassword } },
    );
    const token = login.body.data.login.accessToken as string;
    const headers = {
      Authorization: `Bearer ${token}`,
      'x-club-id': clubId as string,
    };

    const invRes = await request(app.getHttpServer())
      .post('/graphql')
      .set(headers)
      .send({
        query: `mutation ($input: CreateInvoiceInput!) {
          createClubInvoice(input: $input) {
            id
            amountCents
            status
            balanceCents
            totalPaidCents
          }
        }`,
        variables: {
          input: {
            label: 'E2E partial pay',
            baseAmountCents: 10000,
            pricingMethod: 'MANUAL_CASH',
          },
        },
      });
    expect(invRes.status).toBe(200);
    expect(invRes.body.errors).toBeUndefined();
    const invoiceId = invRes.body.data.createClubInvoice.id as string;
    expect(invRes.body.data.createClubInvoice.balanceCents).toBe(10000);
    expect(invRes.body.data.createClubInvoice.totalPaidCents).toBe(0);

    const p1 = await request(app.getHttpServer())
      .post('/graphql')
      .set(headers)
      .send({
        query: `mutation ($input: RecordManualPaymentInput!) {
          recordClubManualPayment(input: $input) { id amountCents externalRef }
        }`,
        variables: {
          input: {
            invoiceId,
            amountCents: 4000,
            method: 'MANUAL_CHECK',
            externalRef: 'CHQ-1',
          },
        },
      });
    expect(p1.status).toBe(200);
    expect(p1.body.errors).toBeUndefined();
    expect(p1.body.data.recordClubManualPayment.externalRef).toBe('CHQ-1');

    const q1 = await request(app.getHttpServer())
      .post('/graphql')
      .set(headers)
      .send({
        query: `{ clubInvoices { id status balanceCents totalPaidCents } }`,
      });
    expect(q1.status).toBe(200);
    expect(q1.body.errors).toBeUndefined();
    const inv = q1.body.data.clubInvoices.find(
      (i: { id: string }) => i.id === invoiceId,
    );
    expect(inv.status).toBe('OPEN');
    expect(inv.balanceCents).toBe(6000);
    expect(inv.totalPaidCents).toBe(4000);

    const p2 = await request(app.getHttpServer())
      .post('/graphql')
      .set(headers)
      .send({
        query: `mutation ($input: RecordManualPaymentInput!) {
          recordClubManualPayment(input: $input) { id amountCents }
        }`,
        variables: {
          input: {
            invoiceId,
            amountCents: 6000,
            method: 'MANUAL_TRANSFER',
          },
        },
      });
    expect(p2.status).toBe(200);
    expect(p2.body.errors).toBeUndefined();

    const q2 = await request(app.getHttpServer())
      .post('/graphql')
      .set(headers)
      .send({
        query: `{ clubInvoices { id status balanceCents totalPaidCents } }`,
      });
    expect(q2.status).toBe(200);
    const inv2 = q2.body.data.clubInvoices.find(
      (i: { id: string }) => i.id === invoiceId,
    );
    expect(inv2.status).toBe('PAID');
    expect(inv2.balanceCents).toBe(0);
    expect(inv2.totalPaidCents).toBe(10000);

    await prisma.payment.deleteMany({
      where: { clubId: clubId as string, invoiceId },
    });
    await prisma.invoice.deleteMany({ where: { id: invoiceId } });
  });
});
