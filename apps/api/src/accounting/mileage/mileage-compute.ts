import type { MileageVehicleKind } from '@prisma/client';
import { incrementCents, resolveScale } from './mileage-scale';

/** Distance réellement parcourue par un déplacement, en mètres. */
export function tripMeters(t: { distanceMeters: number; roundTrip: boolean }): number {
  return t.distanceMeters * (t.roundTrip ? 2 : 1);
}

export interface TripToPrice {
  id: string;
  vehicleId: string;
  tripDate: Date;
  distanceMeters: number;
  roundTrip: boolean;
}

export interface VehicleForPricing {
  id: string;
  kind: MileageVehicleKind;
  fiscalHorsepower: number | null;
  isElectric: boolean;
}

export interface PricedTrip {
  id: string;
  amountCents: number;
  scaleLabel: string;
  provisional: boolean;
}

/** Clé « véhicule × année civile » : l'unité du barème. */
export function vehicleYearKey(vehicleId: string, year: number): string {
  return `${vehicleId}:${year}`;
}

/**
 * Chiffre les déplacements d'une note au barème.
 *
 * Le barème s'applique à la distance annuelle d'un véhicule : chaque
 * déplacement vaut ce qu'il ajoute au montant de l'année, en partant des km
 * déjà indemnisés (`priorMeters`, par véhicule × année). Les déplacements
 * sont pris dans l'ordre chronologique et les incréments se télescopent :
 * leur somme est exactement l'écart de montant annuel, sans dérive
 * d'arrondi.
 */
export function priceTrips(
  trips: TripToPrice[],
  vehicles: Map<string, VehicleForPricing>,
  priorMeters: Map<string, number>,
): PricedTrip[] {
  const cumul = new Map(priorMeters);
  const sorted = [...trips].sort(
    (a, b) => a.tripDate.getTime() - b.tripDate.getTime() || a.id.localeCompare(b.id),
  );
  const priced = new Map<string, PricedTrip>();
  for (const t of sorted) {
    const vehicle = vehicles.get(t.vehicleId);
    if (!vehicle) throw new Error(`Véhicule ${t.vehicleId} inconnu`);
    const year = t.tripDate.getUTCFullYear();
    const scale = resolveScale(vehicle, year);
    const key = vehicleYearKey(t.vehicleId, year);
    const before = cumul.get(key) ?? 0;
    const meters = tripMeters(t);
    priced.set(t.id, {
      id: t.id,
      amountCents: incrementCents(scale, before, meters),
      scaleLabel: `Barème ${scale.scaleYear} – ${scale.label}`,
      provisional: scale.provisional,
    });
    cumul.set(key, before + meters);
  }
  // Dans l'ordre d'entrée, pour que l'appelant retrouve ses lignes.
  return trips.map((t) => priced.get(t.id)!);
}

/** Nombre de trajets par jour ISO : [2, 2, 4] → { 2 → 2, 4 → 1 }. */
export function weekdayCounts(weekdays: number[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const d of weekdays) counts.set(d, (counts.get(d) ?? 0) + 1);
  return counts;
}

/** Jour ISO de la semaine : 1 = lundi … 7 = dimanche. */
export function isoWeekday(d: Date): number {
  const day = d.getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * Les dates où un trajet récurrent a lieu entre `from` et `to` (inclus),
 * dans sa période de validité. Dates en minuit UTC, comme les `@db.Date`.
 * Un jour présent plusieurs fois dans `weekdays` donne autant de fois sa
 * date : `[2, 2]` = deux trajets chaque mardi.
 */
export function recurringDates(
  recurring: { weekdays: number[]; startsOn: Date; endsOn: Date | null },
  from: Date,
  to: Date,
): Date[] {
  const start = Math.max(from.getTime(), recurring.startsOn.getTime());
  const end = Math.min(to.getTime(), recurring.endsOn ? recurring.endsOn.getTime() : Infinity);
  const times = weekdayCounts(recurring.weekdays);
  const out: Date[] = [];
  const DAY = 86_400_000;
  for (let t = start; t <= end; t += DAY) {
    const d = new Date(t);
    for (let i = 0; i < (times.get(isoWeekday(d)) ?? 0); i++) out.push(d);
  }
  return out;
}
