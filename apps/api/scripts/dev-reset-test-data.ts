/**
 * Script de réinitialisation des **données de test** (membres, paniers,
 * factures, paiements, écritures comptables…) tout en gardant intacts :
 *
 *  - Clubs, saisons, modules activés
 *  - Catalogue (formules d'adhésion, frais uniques, règles de tarification)
 *  - Comptes bancaires / caisses (ClubFinancialAccount, ClubPaymentRoute)
 *  - Plan comptable (AccountingAccount, AccountingCohort, mappings)
 *  - Utilisateurs (User), contacts (Contact), équipe admin (ClubMembership)
 *  - Configuration planning : Venue, CourseSlot, DynamicGroup, GradeLevel
 *
 * Usage :
 *   cd apps/api
 *   npx ts-node --compiler-options "{\"module\":\"CommonJS\"}" scripts/dev-reset-test-data.ts
 *
 * ⚠️ NE JAMAIS exécuter en production — vérifie via NODE_ENV + DATABASE_URL.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refus d’exécution en production. Définis NODE_ENV=development.',
    );
  }
  const url = process.env.DATABASE_URL ?? '';
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error(
      `DATABASE_URL ne pointe pas vers localhost (${url}). Refus pour éviter un wipe distant.`,
    );
  }

  console.log('🧹 Reset données de test — début');
  console.log(`   DB cible : ${url}`);

  const counts = await prisma.$transaction(async (tx) => {
    // L'ordre suit les FK descendantes (enfants avant parents).
    const c: Record<string, number> = {};

    // ----- Comptabilité (allocations → lignes → écritures) -----
    c.accountingAllocationGroupTags = (
      await tx.accountingAllocationGroupTag.deleteMany({})
    ).count;
    c.accountingAllocations = (
      await tx.accountingAllocation.deleteMany({})
    ).count;
    c.accountingEntryLines = (
      await tx.accountingEntryLine.deleteMany({})
    ).count;
    c.accountingDocuments = (
      await tx.accountingDocument.deleteMany({})
    ).count;
    c.accountingAuditLogs = (await tx.accountingAuditLog.deleteMany({}))
      .count;
    c.accountingExtractions = (await tx.accountingExtraction.deleteMany({}))
      .count;
    c.accountingEntries = (await tx.accountingEntry.deleteMany({})).count;
    c.accountingPeriodLocks = (await tx.accountingPeriodLock.deleteMany({}))
      .count;
    c.accountingFiscalYearCloses = (
      await tx.accountingFiscalYearClose.deleteMany({})
    ).count;

    // ----- Subventions / sponsoring -----
    c.grantInstallments = (await tx.grantInstallment.deleteMany({})).count;
    c.grantDocuments = (await tx.grantDocument.deleteMany({})).count;
    c.grantApplications = (await tx.grantApplication.deleteMany({})).count;
    c.sponsorshipInstallments = (
      await tx.sponsorshipInstallment.deleteMany({})
    ).count;
    c.sponsorshipDocuments = (await tx.sponsorshipDocument.deleteMany({}))
      .count;
    c.sponsorshipDeals = (await tx.sponsorshipDeal.deleteMany({})).count;

    // ----- Paiements & factures -----
    c.payments = (await tx.payment.deleteMany({})).count;
    c.invoiceLineAdjustments = (
      await tx.invoiceLineAdjustment.deleteMany({})
    ).count;
    c.invoiceLines = (await tx.invoiceLine.deleteMany({})).count;
    c.invoices = (await tx.invoice.deleteMany({})).count;

    // ----- Panier d'adhésion -----
    c.membershipCartItems = (await tx.membershipCartItem.deleteMany({}))
      .count;
    c.membershipCartPendingItems = (
      await tx.membershipCartPendingItem.deleteMany({})
    ).count;
    c.membershipCarts = (await tx.membershipCart.deleteMany({})).count;

    // ----- Boutique : commandes + lignes -----
    c.shopOrderLines = (await tx.shopOrderLine.deleteMany({})).count;
    c.shopOrders = (await tx.shopOrder.deleteMany({})).count;

    // ----- Événements / sondages : registrations + responses -----
    c.clubEventRegistrations = (
      await tx.clubEventRegistration.deleteMany({})
    ).count;
    c.clubSurveyResponses = (await tx.clubSurveyResponse.deleteMany({}))
      .count;

    // ----- Réservations + planning lié aux membres -----
    c.courseSlotBookings = (await tx.courseSlotBooking.deleteMany({})).count;
    // CourseSlot.coachMemberId est en `Restrict` → on doit supprimer
    // les créneaux avant les Members. La structure (Venue) est conservée,
    // l'admin recréera ses créneaux après le reset.
    c.courseSlots = (await tx.courseSlot.deleteMany({})).count;

    // ----- Campagnes messagerie (recipients liés à des Members) -----
    c.messageCampaignRecipients = (
      await tx.messageCampaignRecipient.deleteMany({})
    ).count;
    c.messageCampaigns = (await tx.messageCampaign.deleteMany({})).count;

    // ----- Messagerie tied aux membres -----
    c.chatMessages = (await tx.chatMessage.deleteMany({})).count;
    c.chatRoomMembers = (await tx.chatRoomMember.deleteMany({})).count;
    c.chatRooms = (await tx.chatRoom.deleteMany({})).count;
    c.telegramLinkTokens = (await tx.telegramLinkToken.deleteMany({})).count;

    // ----- Member ↔ groupes dynamiques -----
    c.memberDynamicGroups = (await tx.memberDynamicGroup.deleteMany({}))
      .count;

    // ----- Custom fields valeurs (gardent les définitions) -----
    c.memberCustomFieldValues = (
      await tx.memberCustomFieldValue.deleteMany({})
    ).count;

    // ----- Rôles / assignations -----
    c.memberCustomRoleAssignments = (
      await tx.memberCustomRoleAssignment.deleteMany({})
    ).count;
    c.memberRoleAssignments = (
      await tx.memberRoleAssignment.deleteMany({})
    ).count;

    // ----- Foyers + invitations + groupes foyer -----
    c.familyInvites = (await tx.familyInvite.deleteMany({})).count;
    c.familyMembers = (await tx.familyMember.deleteMany({})).count;
    c.householdGroups = (await tx.householdGroup.deleteMany({})).count;
    c.families = (await tx.family.deleteMany({})).count;

    // ----- Members (en dernier) -----
    c.members = (await tx.member.deleteMany({})).count;

    return c;
  });

  console.log('✅ Reset terminé');
  for (const [k, v] of Object.entries(counts)) {
    if (v > 0) console.log(`   ${k.padEnd(32)} : ${v}`);
  }
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  console.log(`   ${'-'.repeat(32)}`);
  console.log(`   ${'TOTAL'.padEnd(32)} : ${total}`);
  console.log(
    '\n👤 Users + Contacts + Clubs + paramétrages conservés. Tu peux te reconnecter et retester le flow complet.',
  );
}

main()
  .catch((e) => {
    console.error('❌ Reset échoué :', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
