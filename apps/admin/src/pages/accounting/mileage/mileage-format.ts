import type {
  MileageClaimStatus,
  MileageSettlement,
  MileageVehicleKind,
  TaxReceiptOrganismType,
} from '../../../lib/mileage-documents';

export const STATUS_LABEL: Record<MileageClaimStatus, string> = {
  DRAFT: 'Brouillon',
  SUBMITTED: 'À valider',
  APPROVED: 'Validée',
  REJECTED: 'Refusée',
};

export const STATUS_PILL: Record<MileageClaimStatus, string> = {
  DRAFT: 'cf-pill cf-pill--draft',
  SUBMITTED: 'cf-pill cf-pill--warn',
  APPROVED: 'cf-pill cf-pill--ok',
  REJECTED: 'cf-pill cf-pill--danger',
};

export const SETTLEMENT_LABEL: Record<MileageSettlement, string> = {
  REIMBURSEMENT: 'Remboursement',
  DONATION: 'Don (reçu fiscal)',
};

export const VEHICLE_KIND_LABEL: Record<MileageVehicleKind, string> = {
  CAR: 'Voiture',
  MOTORCYCLE: 'Moto',
  MOPED: 'Cyclomoteur',
};

export const ORGANISM_TYPE_LABEL: Record<TaxReceiptOrganismType, string> = {
  PUBLIC_UTILITY: 'Reconnu d’utilité publique',
  GENERAL_INTEREST: 'Organisme d’intérêt général',
};

const WEEKDAY_SHORT = ['', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

/** [1, 3, 5] → « lun., mer., ven. » */
export function formatWeekdays(days: number[]): string {
  return [...days]
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_SHORT[d] ?? '?')
    .join(', ');
}

/** 12345 m → « 12,3 km ». */
export function formatKm(meters: number): string {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(meters / 1000)} km`;
}

/** « 12,5 » → 12500 ; vide → null ; invalide ou ≤ 0 → NaN. */
export function kmInputToMeters(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  if (!/^\d+(\.\d{1,3})?$/.test(s)) return Number.NaN;
  const m = Math.round(Number(s) * 1000);
  return m > 0 ? m : Number.NaN;
}

/** « 2026-09-01T08:00:00.000Z » → « 01/09/2026 ». */
export function formatDateTimeFr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR');
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Erreur inattendue';
}

/** Télécharge un PDF reçu en base64 (requête GraphQL) sous le nom donné. */
export function downloadBase64Pdf(base64: string, filename: string): void {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
