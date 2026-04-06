export function normalizeSegment(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export function buildPseudoBase(firstName: string, lastName: string): string {
  const a = normalizeSegment(firstName.trim());
  const b = normalizeSegment(lastName.trim());
  if (!a && !b) return 'membre';
  if (!a) return b;
  if (!b) return a;
  return `${a}_${b}`;
}

export function normalizePseudoInput(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
}
