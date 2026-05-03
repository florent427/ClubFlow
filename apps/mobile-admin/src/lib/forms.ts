/**
 * Helpers de formulaire — saisie FR (date JJ/MM/AAAA, heure HH:MM)
 * convertis vers ISO côté backend.
 */

/** "JJ/MM/AAAA" → "AAAA-MM-JJ" (null si format invalide). */
export function parseFrDate(s: string): string | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

/** Combine date FR + heure HH:MM en ISO 8601 UTC (null si invalide). */
export function frDateTimeToIso(date: string, time: string): string | null {
  const d = parseFrDate(date);
  const t = time.match(/^(\d{2}):(\d{2})$/);
  if (!d || !t) return null;
  return `${d}T${t[1]}:${t[2]}:00.000Z`;
}

/** Date FR (sans heure) en ISO 8601 minuit UTC. */
export function frDateToIso(date: string): string | null {
  const d = parseFrDate(date);
  if (!d) return null;
  return `${d}T00:00:00.000Z`;
}
