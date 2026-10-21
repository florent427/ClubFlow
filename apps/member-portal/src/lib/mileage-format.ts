import type {
  MileageClaimStatus,
  MileageVehicleKind,
} from './mileage-documents';

/** Lun…Dim, index ISO 1 = lundi … 7 = dimanche. */
export const WEEKDAYS: ReadonlyArray<{ iso: number; short: string }> = [
  { iso: 1, short: 'Lun' },
  { iso: 2, short: 'Mar' },
  { iso: 3, short: 'Mer' },
  { iso: 4, short: 'Jeu' },
  { iso: 5, short: 'Ven' },
  { iso: 6, short: 'Sam' },
  { iso: 7, short: 'Dim' },
];

export const VEHICLE_KIND_LABELS: Record<MileageVehicleKind, string> = {
  CAR: 'Voiture',
  MOTORCYCLE: 'Moto',
  MOPED: 'Cyclomoteur (≤ 50 cm³)',
};

/**
 * « 12,5 » ou « 12.5 » km → 12 500 m. `null` si la saisie n'est pas une
 * distance positive : le formulaire refuse plutôt que d'envoyer 0.
 */
export function kmInputToMeters(input: string): number | null {
  const normalized = input.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const meters = Math.round(Number(normalized) * 1000);
  return meters > 0 ? meters : null;
}

/** 12 500 m → « 12,5 » (valeur de champ, sans unité). */
export function metersToKmInput(meters: number): string {
  return String(Math.round(meters) / 1000).replace('.', ',');
}

/** 12 500 m → « 12,5 km ». */
export function formatKm(meters: number): string {
  const km = meters / 1000;
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(km)} km`;
}

/**
 * 'YYYY-MM-DD' → « 12 oct. 2026 ». Parse en date locale : `new Date('2026-10-12')`
 * serait minuit UTC, donc la veille sur un fuseau négatif.
 */
export function formatIsoDay(iso: string | null): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Date locale du jour au format 'YYYY-MM-DD'. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/** Premier jour du mois de `now`, 'YYYY-MM-DD'. */
export function firstDayOfMonthIso(now: Date = new Date()): string {
  return `${todayIso(now).slice(0, 7)}-01`;
}

/** Nombre de jours entre deux 'YYYY-MM-DD' (to − from). */
export function daysBetween(fromIso: string, toIso: string): number {
  const f = Date.parse(`${fromIso}T00:00:00Z`);
  const t = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((t - f) / 86_400_000);
}

/** [3, 1, 5] → « Lun, Mer, Ven ». */
export function formatWeekdays(weekdays: number[]): string {
  return WEEKDAYS.filter((w) => weekdays.includes(w.iso))
    .map((w) => w.short)
    .join(', ');
}

export type ClaimBadge = {
  label: string;
  tone: 'neutral' | 'info' | 'success' | 'danger' | 'warning';
};

/**
 * Badge d'une note. Une note renvoyée en brouillon porte le commentaire du
 * trésorier : elle est « à corriger », pas un brouillon ordinaire.
 */
export function claimBadge(claim: {
  status: MileageClaimStatus;
  reviewComment: string | null;
}): ClaimBadge {
  switch (claim.status) {
    case 'DRAFT':
      return claim.reviewComment
        ? { label: 'À corriger', tone: 'warning' }
        : { label: 'Brouillon', tone: 'neutral' };
    case 'SUBMITTED':
      return { label: 'En attente de validation', tone: 'info' };
    case 'APPROVED':
      return { label: 'Validée', tone: 'success' };
    case 'REJECTED':
      return { label: 'Refusée', tone: 'danger' };
  }
}

/** PDF reçu en base64 → Blob téléchargeable. */
export function base64ToPdfBlob(base64: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'application/pdf' });
}

/** Message d'une erreur Apollo ou réseau, à afficher tel quel. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Une erreur est survenue.';
}
