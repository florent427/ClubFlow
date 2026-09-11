import type { BankStatementLineStatus, BankStatementStatus } from '@prisma/client';

/**
 * Contrôle d'intégrité d'un relevé (ADR-0014 §4). C'est LUI qui garantit
 * qu'aucune ligne n'a été inventée ni oubliée : deux modèles peuvent se
 * tromper ensemble, l'arithmétique non.
 */
export interface IntegrityInput {
  openingBalanceCents: number;
  closingBalanceCents: number;
  lineAmounts: number[];
  /**
   * Solde de fin du relevé précédent sur le même compte, ou solde
   * d'ouverture du compte pour le premier. Null = inconnu (solde
   * d'ouverture jamais renseigné) : le chaînage ne peut pas être vérifié.
   */
  previousClosingCents: number | null;
}

export interface IntegrityResult {
  /** début + Σ − fin. 0 = juste. */
  deltaCents: number;
  arithmeticOk: boolean;
  chainOk: boolean | null;
  chainExpectedCents: number | null;
  /** Les deux garanties tiennent : le relevé est exploitable. */
  ok: boolean;
}

export function checkStatementIntegrity(input: IntegrityInput): IntegrityResult {
  const sum = input.lineAmounts.reduce((s, a) => s + a, 0);
  const deltaCents = input.openingBalanceCents + sum - input.closingBalanceCents;
  const arithmeticOk = deltaCents === 0;
  const chainOk =
    input.previousClosingCents === null
      ? null
      : input.previousClosingCents === input.openingBalanceCents;
  return {
    deltaCents,
    arithmeticOk,
    chainOk,
    chainExpectedCents: input.previousClosingCents,
    ok: arithmeticOk && chainOk === true,
  };
}

/**
 * L'UNIQUE façon de calculer le statut d'un relevé : `READY` seulement si
 * le contrôle passe, `RECONCILED` seulement si, en plus, chaque ligne est
 * rapprochée ou ignorée.
 */
export function deriveStatementStatus(
  integrity: Pick<IntegrityResult, 'ok'>,
  lineStatuses: BankStatementLineStatus[],
): BankStatementStatus {
  if (!integrity.ok) return 'NEEDS_CHECK';
  const allResolved =
    lineStatuses.length > 0 &&
    lineStatuses.every((s) => s === 'MATCHED' || s === 'IGNORED');
  return allResolved ? 'RECONCILED' : 'READY';
}
