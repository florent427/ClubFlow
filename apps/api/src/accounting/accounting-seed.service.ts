import { Injectable, Logger } from '@nestjs/common';
import { AccountingAccountKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Entrée du plan comptable curated seedé pour chaque club qui active
 * le module ACCOUNTING.
 */
interface AccountSeedRow {
  code: string;
  label: string;
  kind: AccountingAccountKind;
  sortOrder: number;
}

interface CohortSeedRow {
  code: string;
  label: string;
  minAge: number | null;
  maxAge: number | null;
  sortOrder: number;
}

interface MappingSeedRow {
  sourceType: string;
  accountCode: string;
}

/**
 * Service de seed du plan comptable, cohortes par défaut et mappings
 * source → compte pour un club. Appelé :
 * - Automatiquement lors de l'activation du module ACCOUNTING (hook
 *   dans ClubModulesService).
 * - Lazy-init depuis `listAccounts` ou `listCohorts` si les tables
 *   sont vides pour un club (rattrape les clubs legacy pré-migration).
 *
 * Idempotent : utilise `ON CONFLICT DO NOTHING` via upsert.
 */
@Injectable()
export class AccountingSeedService {
  private readonly logger = new Logger(AccountingSeedService.name);

  /**
   * Plan comptable curated PCG associatif. 40+ comptes couvrant :
   * - Charges classe 6 (dépenses courantes < 500€ HT)
   * - Produits classe 7 (recettes)
   * - Immobilisations classe 2 (biens durables ≥ 500€ HT, amortis sur
   *   plusieurs années) : distinction cruciale pour la compta assoc.
   * - Actif classe 4/5 (tiers, trésorerie)
   * - Classe 8 contributions en nature
   *
   * Règle fiscale : un bien à usage durable (plus d'un exercice) au-delà
   * de 500€ HT est une immobilisation (classe 2), pas une charge.
   * L'IA doit utiliser cette règle pour choisir entre 606xxx et 218xxx.
   */
  private static readonly DEFAULT_ACCOUNTS: AccountSeedRow[] = [
    // === Charges (dépenses < 500€ HT) — classe 6 ===
    { code: '606100', label: 'Fournitures non stockables (eau, énergie)', kind: 'EXPENSE', sortOrder: 10 },
    { code: '606300', label: 'Petit équipement (< 500€ HT)', kind: 'EXPENSE', sortOrder: 11 },
    { code: '606400', label: 'Fournitures administratives', kind: 'EXPENSE', sortOrder: 12 },
    { code: '606800', label: 'Autres matières et fournitures', kind: 'EXPENSE', sortOrder: 13 },
    { code: '611000', label: 'Sous-traitance générale', kind: 'EXPENSE', sortOrder: 20 },
    { code: '613200', label: 'Locations immobilières', kind: 'EXPENSE', sortOrder: 21 },
    { code: '613500', label: 'Locations mobilières (matériel sportif)', kind: 'EXPENSE', sortOrder: 22 },
    { code: '615000', label: 'Entretien et réparations', kind: 'EXPENSE', sortOrder: 23 },
    { code: '616000', label: 'Primes d\u2019assurances', kind: 'EXPENSE', sortOrder: 24 },
    { code: '618000', label: 'Documentation, cotisations fédérales', kind: 'EXPENSE', sortOrder: 25 },
    { code: '622600', label: 'Honoraires', kind: 'EXPENSE', sortOrder: 30 },
    { code: '623000', label: 'Publicité, communication', kind: 'EXPENSE', sortOrder: 31 },
    { code: '624000', label: 'Transports et déplacements', kind: 'EXPENSE', sortOrder: 32 },
    { code: '625100', label: 'Frais de déplacement bénévoles', kind: 'EXPENSE', sortOrder: 33 },
    { code: '626000', label: 'Frais postaux et télécommunications', kind: 'EXPENSE', sortOrder: 34 },
    { code: '627000', label: 'Services bancaires (frais Stripe, virements)', kind: 'EXPENSE', sortOrder: 35 },
    { code: '641000', label: 'Rémunérations du personnel', kind: 'EXPENSE', sortOrder: 40 },
    { code: '645000', label: 'Charges sociales', kind: 'EXPENSE', sortOrder: 41 },

    // === Produits (recettes) — classe 7 ===
    { code: '706100', label: 'Cotisations membres (adhésions)', kind: 'INCOME', sortOrder: 50 },
    { code: '708000', label: 'Produits des activités annexes (licences, stages)', kind: 'INCOME', sortOrder: 51 },
    { code: '740000', label: 'Subventions d\u2019exploitation', kind: 'INCOME', sortOrder: 60 },
    { code: '741000', label: 'Subventions État / ANS', kind: 'INCOME', sortOrder: 61 },
    { code: '742000', label: 'Subventions Collectivités territoriales', kind: 'INCOME', sortOrder: 62 },
    { code: '743000', label: 'Subventions organismes privés (FDVA, fondations)', kind: 'INCOME', sortOrder: 63 },
    { code: '754000', label: 'Sponsoring / Mécénat', kind: 'INCOME', sortOrder: 70 },
    { code: '756000', label: 'Dons manuels', kind: 'INCOME', sortOrder: 71 },
    { code: '758000', label: 'Produits divers de gestion courante', kind: 'INCOME', sortOrder: 72 },

    // === Immobilisations (biens durables ≥ 500€ HT) — classe 2 ===
    // Utiliser ces comptes au lieu des 606xxx quand le bien coûte ≥500€ HT
    // et sera utilisé pendant plusieurs exercices (matériel sportif lourd,
    // équipements, aménagements, etc.).
    { code: '205000', label: 'Concessions, logiciels, licences (immobilisation)', kind: 'ASSET', sortOrder: 73 },
    { code: '213500', label: 'Installations générales, agencements (immobilisation)', kind: 'ASSET', sortOrder: 74 },
    { code: '215400', label: 'Matériel sportif lourd ≥ 500€ HT (tatamis, rings, cages, tapis, machines)', kind: 'ASSET', sortOrder: 75 },
    { code: '218200', label: 'Matériel de transport (véhicules, remorques)', kind: 'ASSET', sortOrder: 76 },
    { code: '218300', label: 'Matériel de bureau et informatique ≥ 500€ HT (PC, imprimantes pro)', kind: 'ASSET', sortOrder: 77 },
    { code: '218400', label: 'Mobilier ≥ 500€ HT', kind: 'ASSET', sortOrder: 78 },

    // === Actif / tiers / trésorerie ===
    { code: '411000', label: 'Clients / Cotisants', kind: 'ASSET', sortOrder: 80 },
    { code: '512000', label: 'Banque', kind: 'ASSET', sortOrder: 81 },
    { code: '530000', label: 'Caisse', kind: 'ASSET', sortOrder: 82 },

    // === Contributions en nature — classe 8 (neutre) ===
    { code: '860000', label: 'Secours en nature, prestations', kind: 'NEUTRAL_IN_KIND', sortOrder: 90 },
    { code: '861000', label: 'Mise à disposition gratuite de biens', kind: 'NEUTRAL_IN_KIND', sortOrder: 91 },
    { code: '864000', label: 'Personnel bénévole', kind: 'NEUTRAL_IN_KIND', sortOrder: 92 },
    { code: '870000', label: 'Bénévolat (contrepartie)', kind: 'NEUTRAL_IN_KIND', sortOrder: 93 },
    { code: '871000', label: 'Prestations en nature (contrepartie)', kind: 'NEUTRAL_IN_KIND', sortOrder: 94 },
    { code: '875000', label: 'Dons en nature (contrepartie)', kind: 'NEUTRAL_IN_KIND', sortOrder: 95 },
  ];

  private static readonly DEFAULT_COHORTS: CohortSeedRow[] = [
    { code: 'BABY', label: 'Baby (0-5 ans)', minAge: 0, maxAge: 5, sortOrder: 1 },
    { code: 'ENFANT', label: 'Enfants (6-11 ans)', minAge: 6, maxAge: 11, sortOrder: 2 },
    { code: 'ADO', label: 'Ados (12-17 ans)', minAge: 12, maxAge: 17, sortOrder: 3 },
    { code: 'ADULTE', label: 'Adultes (18-59 ans)', minAge: 18, maxAge: 59, sortOrder: 4 },
    { code: 'SENIOR', label: 'Seniors (60+ ans)', minAge: 60, maxAge: null, sortOrder: 5 },
  ];

  private static readonly DEFAULT_MAPPINGS: MappingSeedRow[] = [
    { sourceType: 'MEMBERSHIP_PRODUCT', accountCode: '706100' },
    { sourceType: 'MEMBERSHIP_ONE_TIME_FEE', accountCode: '708000' },
    { sourceType: 'SHOP_PRODUCT', accountCode: '708000' },
    { sourceType: 'SUBSIDY', accountCode: '740000' },
    { sourceType: 'SPONSORSHIP_CASH', accountCode: '754000' },
    { sourceType: 'SPONSORSHIP_IN_KIND', accountCode: '871000' },
    { sourceType: 'STRIPE_FEE', accountCode: '627000' },
    { sourceType: 'BANK_ACCOUNT', accountCode: '512000' },
    { sourceType: 'REFUND', accountCode: '706100' },
  ];

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Seed / top-up du plan comptable pour un club. Idempotent :
   * - Crée les cohortes manquantes (par code)
   * - Crée les comptes manquants (par code)
   * - Crée les mappings manquants (par sourceType)
   *
   * Appelé :
   * - À l'activation du module ACCOUNTING (seed initial pour nouveau club)
   * - En lazy-init depuis le resolver si listAccounts renvoie 0
   * - Via la mutation explicite `initClubAccountingPlan` (bouton UI
   *   "Initialiser le plan", ajoute les nouveaux comptes quand on en
   *   introduit dans de futures versions sans obliger une migration)
   */
  async seedIfEmpty(clubId: string): Promise<{
    accountsCreated: number;
    cohortsCreated: number;
    mappingsCreated: number;
  }> {
    let accountsCreated = 0;
    let cohortsCreated = 0;
    let mappingsCreated = 0;

    // 1. Cohortes — upsert par (clubId, code)
    const existingCohorts = await this.prisma.accountingCohort.findMany({
      where: { clubId },
      select: { code: true },
    });
    const existingCohortCodes = new Set(existingCohorts.map((c) => c.code));
    for (const c of AccountingSeedService.DEFAULT_COHORTS) {
      if (existingCohortCodes.has(c.code)) continue;
      await this.prisma.accountingCohort.create({
        data: {
          clubId,
          code: c.code,
          label: c.label,
          minAge: c.minAge,
          maxAge: c.maxAge,
          sortOrder: c.sortOrder,
          isDefault: true,
        },
      });
      cohortsCreated++;
    }

    // 2. Plan comptable — upsert par (clubId, code)
    const existingAccounts = await this.prisma.accountingAccount.findMany({
      where: { clubId },
      select: { code: true },
    });
    const existingCodes = new Set(existingAccounts.map((a) => a.code));
    for (const a of AccountingSeedService.DEFAULT_ACCOUNTS) {
      if (existingCodes.has(a.code)) continue;
      await this.prisma.accountingAccount.create({
        data: {
          clubId,
          code: a.code,
          label: a.label,
          kind: a.kind,
          sortOrder: a.sortOrder,
          isDefault: true,
          isActive: true,
        },
      });
      accountsCreated++;
    }

    // 3. Mappings — par (clubId, sourceType, sourceId=null)
    const existingMappings = await this.prisma.accountingAccountMapping.findMany({
      where: { clubId, sourceId: null },
      select: { sourceType: true },
    });
    const existingMappingTypes = new Set(
      existingMappings.map((m) => m.sourceType),
    );
    const allAccounts = await this.prisma.accountingAccount.findMany({
      where: { clubId },
    });
    const byCode = new Map(allAccounts.map((a) => [a.code, a]));
    for (const m of AccountingSeedService.DEFAULT_MAPPINGS) {
      if (existingMappingTypes.has(m.sourceType)) continue;
      const acc = byCode.get(m.accountCode);
      if (!acc) continue;
      try {
        await this.prisma.accountingAccountMapping.create({
          data: {
            clubId,
            sourceType: m.sourceType,
            sourceId: null,
            accountId: acc.id,
            accountCode: acc.code,
          },
        });
        mappingsCreated++;
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError)) throw err;
      }
    }

    if (accountsCreated + cohortsCreated + mappingsCreated > 0) {
      this.logger.log(
        `Seed compta club ${clubId}: +${accountsCreated} comptes, +${cohortsCreated} cohortes, +${mappingsCreated} mappings`,
      );
    }

    return { accountsCreated, cohortsCreated, mappingsCreated };
  }
}
