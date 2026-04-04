/** Chevauchement d’intervalles [start, end) au sens large (bornes inclusives côté chevauchement métier). */

export function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}
