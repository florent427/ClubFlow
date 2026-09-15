import type { Prisma } from '@prisma/client';

/**
 * Verrous d'un règlement et d'une annulation de facture (ADR-0022, §3), levés
 * au commit de la transaction qui les prend.
 *
 * `$executeRaw`, jamais `$queryRaw` : `pg_advisory_xact_lock` rend `void`, que
 * `$queryRaw` ne sait pas lire (pitfalls/prisma-executeraw-pour-retour-void.md).
 *
 * Ordre imposé, pour qu'aucun interblocage ne soit possible : la personne, puis
 * les factures dans l'ordre de leurs identifiants, puis seulement les lignes
 * écrites (une commande boutique, un panier).
 *
 * Qui prend quoi :
 * - la saisie manuelle et l'avoir : la facture ;
 * - l'imputation du crédit : la personne, puis la facture ;
 * - tout chemin qui annule une facture : ses factures, avant de relire leur
 *   statut et leurs paiements.
 */

type LockClient = Pick<Prisma.TransactionClient, '$executeRaw'>;

export async function lockPayerCreditInTx(
  tx: LockClient,
  personKey: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('clubflow:payer-credit'), hashtext(${personKey}))`;
}

export async function lockInvoiceInTx(
  tx: LockClient,
  invoiceId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('clubflow:invoice'), hashtext(${invoiceId}))`;
}

/** Plusieurs factures, chacune une fois, dans l'ordre de leurs identifiants. */
export async function lockInvoicesInTx(
  tx: LockClient,
  invoiceIds: Iterable<string>,
): Promise<void> {
  for (const invoiceId of [...new Set(invoiceIds)].sort()) {
    await lockInvoiceInTx(tx, invoiceId);
  }
}
