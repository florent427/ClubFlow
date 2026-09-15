import { getClubId, getToken } from './storage';
import type { InvoicePurposeStr } from './types';

/** Racine REST de l'API : le GraphQL est servi sous `/graphql`. */
export const API_ROOT = (
  (import.meta.env.VITE_GRAPHQL_HTTP as string | undefined) ??
  'http://localhost:3000/graphql'
).replace(/\/graphql\/?$/, '');

/**
 * Nom du fichier PDF : il dit ce qu'est le document, comme le fait l'API
 * (`invoice-pdf.controller.ts`).
 */
export function invoicePdfFilename(inv: {
  id: string;
  isCreditNote: boolean;
  purpose: InvoicePurposeStr;
}): string {
  const shortId = inv.id.slice(0, 8).toUpperCase();
  if (inv.isCreditNote) return `Avoir_${shortId}.pdf`;
  if (inv.purpose === 'PAYER_CREDIT_DEPOSIT') return `Recu_avance_${shortId}.pdf`;
  return `Facture_${shortId}.pdf`;
}

/** Télécharge le PDF d'une facture, d'un avoir ou d'un reçu d'avance. */
export async function downloadInvoicePdf(invoiceId: string, filename: string) {
  const token = getToken();
  const clubId = getClubId();
  const res = await fetch(`${API_ROOT}/invoices/${invoiceId}/pdf`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(clubId ? { 'x-club-id': clubId } : {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Téléchargement impossible (HTTP ${res.status})${text ? ': ' + text : ''}`,
    );
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
