import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ClubFinancialAccountKind,
  ClubPaymentMethod,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Input typé pour la création d'un compte financier.
 */
export interface CreateFinancialAccountInput {
  kind: ClubFinancialAccountKind;
  label: string;
  accountingAccountId: string;
  iban?: string | null;
  bic?: string | null;
  stripeAccountId?: string | null;
  isDefault?: boolean;
  notes?: string | null;
  sortOrder?: number;
}

export interface UpdateFinancialAccountInput {
  label?: string;
  iban?: string | null;
  bic?: string | null;
  stripeAccountId?: string | null;
  isDefault?: boolean;
  isActive?: boolean;
  notes?: string | null;
  sortOrder?: number;
}

/**
 * Service responsable des comptes financiers réels d'un club (banques,
 * caisses, comptes de transit Stripe/HelloAsso). Lié au plan comptable
 * via FK `accountingAccountId`.
 *
 * Responsabilités :
 *  - CRUD avec validation de cohérence kind ↔ code PCG.
 *  - `resolveForPayment(method)` : routage paiement → compte financier
 *    selon les `ClubPaymentRoute` configurées + cascade fallback.
 */
@Injectable()
export class ClubFinancialAccountsService {
  private readonly logger = new Logger(ClubFinancialAccountsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==========================================================================
  // Lecture
  // ==========================================================================

  async listAll(clubId: string) {
    return this.prisma.clubFinancialAccount.findMany({
      where: { clubId },
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
      include: { accountingAccount: true },
    });
  }

  async listByKind(clubId: string, kind: ClubFinancialAccountKind) {
    return this.prisma.clubFinancialAccount.findMany({
      where: { clubId, kind, isActive: true },
      orderBy: [
        { isDefault: 'desc' },
        { sortOrder: 'asc' },
        { label: 'asc' },
      ],
      include: { accountingAccount: true },
    });
  }

  async getById(clubId: string, id: string) {
    const row = await this.prisma.clubFinancialAccount.findFirst({
      where: { clubId, id },
      include: { accountingAccount: true },
    });
    if (!row) throw new NotFoundException('Compte financier introuvable');
    return row;
  }

  async getDefault(clubId: string, kind: ClubFinancialAccountKind) {
    return this.prisma.clubFinancialAccount.findFirst({
      where: { clubId, kind, isActive: true, isDefault: true },
      include: { accountingAccount: true },
    });
  }

  // ==========================================================================
  // CRUD
  // ==========================================================================

  /**
   * Création d'un compte financier. Valide :
   *  - L'`accountingAccountId` existe dans le plan comptable du club.
   *  - Le kind est cohérent avec le code PCG (BANK/STRIPE_TRANSIT/OTHER_TRANSIT
   *    → 51x, CASH → 53x).
   *  - Pas de doublon (même AccountingAccount déjà lié).
   *  - Si `isDefault=true`, repasse les autres défauts du même kind à false.
   */
  async create(clubId: string, input: CreateFinancialAccountInput) {
    const account = await this.prisma.accountingAccount.findFirst({
      where: { clubId, id: input.accountingAccountId },
    });
    if (!account) {
      throw new BadRequestException(
        `Compte PCG ${input.accountingAccountId} introuvable pour ce club.`,
      );
    }
    this.assertKindCodeCoherence(input.kind, account.code);

    return this.prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.clubFinancialAccount.updateMany({
          where: { clubId, kind: input.kind, isDefault: true },
          data: { isDefault: false },
        });
      }
      try {
        return await tx.clubFinancialAccount.create({
          data: {
            clubId,
            kind: input.kind,
            label: input.label,
            accountingAccountId: input.accountingAccountId,
            iban: input.iban ?? null,
            bic: input.bic ?? null,
            stripeAccountId: input.stripeAccountId ?? null,
            isDefault: input.isDefault ?? false,
            sortOrder: input.sortOrder ?? 0,
            notes: input.notes ?? null,
          },
          include: { accountingAccount: true },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          throw new BadRequestException(
            `Le compte PCG ${account.code} est déjà associé à un compte financier.`,
          );
        }
        throw err;
      }
    });
  }

  async update(clubId: string, id: string, patch: UpdateFinancialAccountInput) {
    const existing = await this.getById(clubId, id);
    return this.prisma.$transaction(async (tx) => {
      if (patch.isDefault === true && !existing.isDefault) {
        await tx.clubFinancialAccount.updateMany({
          where: { clubId, kind: existing.kind, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.clubFinancialAccount.update({
        where: { id },
        data: {
          ...(patch.label !== undefined ? { label: patch.label } : {}),
          ...(patch.iban !== undefined ? { iban: patch.iban } : {}),
          ...(patch.bic !== undefined ? { bic: patch.bic } : {}),
          ...(patch.stripeAccountId !== undefined
            ? { stripeAccountId: patch.stripeAccountId }
            : {}),
          ...(patch.isDefault !== undefined
            ? { isDefault: patch.isDefault }
            : {}),
          ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
          ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
          ...(patch.sortOrder !== undefined
            ? { sortOrder: patch.sortOrder }
            : {}),
        },
        include: { accountingAccount: true },
      });
    });
  }

  /**
   * Soft delete : passe `isActive=false`. Refusé si le compte est
   * référencé par une route active OU par des entries POSTED/LOCKED
   * récentes (impossible alors de garder un audit propre).
   */
  async archive(clubId: string, id: string): Promise<boolean> {
    const existing = await this.getById(clubId, id);
    const usedByRoute = await this.prisma.clubPaymentRoute.count({
      where: { clubId, financialAccountId: id },
    });
    if (usedByRoute > 0) {
      throw new BadRequestException(
        'Ce compte est encore utilisé par une route de paiement. ' +
          'Modifie d’abord la route avant d’archiver.',
      );
    }
    await this.prisma.clubFinancialAccount.update({
      where: { id: existing.id },
      data: { isActive: false, isDefault: false },
    });
    return true;
  }

  // ==========================================================================
  // Routage paiement → compte financier
  // ==========================================================================

  /**
   * Cascade de résolution :
   *  1. `ClubPaymentRoute(method)` configurée → retourne sa `financialAccount`.
   *  2. Sinon `getDefault(clubId, kindFromMethod(method))` → retourne le
   *     compte par défaut du kind correspondant.
   *  3. Sinon, fallback sur n'importe quel BANK actif (rétrocompat).
   *  4. Sinon throw — l'admin doit configurer.
   */
  async resolveForPayment(clubId: string, method: ClubPaymentMethod) {
    // Étape 1 : route explicite
    const route = await this.prisma.clubPaymentRoute.findUnique({
      where: { clubId_method: { clubId, method } },
      include: {
        financialAccount: { include: { accountingAccount: true } },
      },
    });
    if (route?.financialAccount?.isActive) {
      return route.financialAccount;
    }

    // Étape 2 : default du kind correspondant
    const targetKind = this.kindFromMethod(method);
    const def = await this.getDefault(clubId, targetKind);
    if (def) return def;

    // Étape 3 : fallback BANK actif (utile si on cherche STRIPE_TRANSIT
    // mais que l'admin n'a pas encore créé son compte Stripe)
    const fallbackBank = await this.prisma.clubFinancialAccount.findFirst({
      where: {
        clubId,
        kind: ClubFinancialAccountKind.BANK,
        isActive: true,
      },
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
      include: { accountingAccount: true },
    });
    if (fallbackBank) return fallbackBank;

    throw new BadRequestException(
      'Aucun compte financier configuré pour ce club. ' +
        'Va dans Paramètres → Comptabilité → Comptes bancaires & caisses.',
    );
  }

  /**
   * Mapping méthode de paiement → kind de compte attendu (pour le routage
   * default si pas de `ClubPaymentRoute` explicite).
   */
  kindFromMethod(method: ClubPaymentMethod): ClubFinancialAccountKind {
    switch (method) {
      case ClubPaymentMethod.STRIPE_CARD:
        return ClubFinancialAccountKind.STRIPE_TRANSIT;
      case ClubPaymentMethod.MANUAL_CASH:
        return ClubFinancialAccountKind.CASH;
      case ClubPaymentMethod.MANUAL_CHECK:
      case ClubPaymentMethod.MANUAL_TRANSFER:
        return ClubFinancialAccountKind.BANK;
      default:
        return ClubFinancialAccountKind.BANK;
    }
  }

  // ==========================================================================
  // Helpers privés
  // ==========================================================================

  /**
   * Cohérence kind ↔ code PCG :
   *  - BANK / STRIPE_TRANSIT / OTHER_TRANSIT → code commençant par 51
   *  - CASH → code commençant par 53
   * Refus sinon — empêche les erreurs de saisie type "BANK lié à 606300".
   */
  private assertKindCodeCoherence(
    kind: ClubFinancialAccountKind,
    code: string,
  ): void {
    const isCashKind = kind === ClubFinancialAccountKind.CASH;
    const startsWith53 = code.startsWith('53');
    const startsWith51 = code.startsWith('51');

    if (isCashKind && !startsWith53) {
      throw new BadRequestException(
        `Une caisse (CASH) doit pointer sur un compte 53xxxx, pas ${code}.`,
      );
    }
    if (!isCashKind && !startsWith51) {
      throw new BadRequestException(
        `Un compte ${kind} doit pointer sur un compte 51xxxx, pas ${code}.`,
      );
    }
  }
}
