import { MileageVehicleKind } from '@prisma/client';
import { isoWeekday, priceTrips, recurringDates, tripMeters, vehicleYearKey } from './mileage-compute';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const car5 = { id: 'v1', kind: MileageVehicleKind.CAR, fiscalHorsepower: 5, isElectric: false };
const vehicles = new Map([[car5.id, car5]]);

describe('déplacements', () => {
  it('double un aller-retour', () => {
    expect(tripMeters({ distanceMeters: 12_500, roundTrip: true })).toBe(25_000);
    expect(tripMeters({ distanceMeters: 12_500, roundTrip: false })).toBe(12_500);
  });

  it('numérote les jours à la norme ISO', () => {
    expect(isoWeekday(d('2026-10-19'))).toBe(1); // lundi
    expect(isoWeekday(d('2026-10-25'))).toBe(7); // dimanche
  });

  it('génère les jours d’un trajet récurrent dans sa période de validité', () => {
    const r = { weekdays: [2, 4], startsOn: d('2026-10-08'), endsOn: d('2026-10-27') };
    const dates = recurringDates(r, d('2026-10-01'), d('2026-10-31')).map((x) =>
      x.toISOString().slice(0, 10),
    );
    // Mardis et jeudis du 8 (jeudi) au 27 (mardi) inclus.
    expect(dates).toEqual([
      '2026-10-08',
      '2026-10-13',
      '2026-10-15',
      '2026-10-20',
      '2026-10-22',
      '2026-10-27',
    ]);
    // Sans fin de validité, borné par l'intervalle demandé.
    expect(recurringDates({ ...r, endsOn: null }, d('2026-11-01'), d('2026-11-06'))).toHaveLength(2);
  });
});

describe('chiffrage d’une note', () => {
  it('part des km déjà indemnisés dans l’année pour ce véhicule', () => {
    const trips = [{ id: 't1', vehicleId: 'v1', tripDate: d('2026-10-02'), distanceMeters: 50_000, roundTrip: true }];
    const fresh = priceTrips(trips, vehicles, new Map());
    // 100 km à 0,636 €
    expect(fresh[0].amountCents).toBe(6_360);
    // 10 000 km déjà indemnisés : tranche dégressive à 0,357 €.
    const after = priceTrips(trips, vehicles, new Map([[vehicleYearKey('v1', 2026), 10_000_000]]));
    expect(after[0].amountCents).toBe(3_570);
  });

  it('additionne au centime près ce que vaut la distance totale', () => {
    const trips = Array.from({ length: 7 }, (_, i) => ({
      id: `t${i}`,
      vehicleId: 'v1',
      tripDate: d(`2026-03-0${i + 1}`),
      distanceMeters: 3_333,
      roundTrip: true,
    }));
    const priced = priceTrips(trips, vehicles, new Map());
    const total = priced.reduce((s, p) => s + p.amountCents, 0);
    // 7 × 6,666 km = 46,662 km × 0,636 € = 29,677 € → 2 968 c, sans dérive d'arrondi.
    expect(total).toBe(Math.round((7 * 6_666 * 636) / 10_000));
  });

  it('compte les années séparément', () => {
    const trips = [
      { id: 'a', vehicleId: 'v1', tripDate: d('2025-12-30'), distanceMeters: 100_000, roundTrip: false },
      { id: 'b', vehicleId: 'v1', tripDate: d('2026-01-02'), distanceMeters: 100_000, roundTrip: false },
    ];
    const prior = new Map([[vehicleYearKey('v1', 2025), 10_000_000]]);
    const [a, b] = priceTrips(trips, vehicles, prior);
    expect(a.amountCents).toBe(3_570); // 2025 : déjà au-delà de 5 000 km
    expect(b.amountCents).toBe(6_360); // 2026 : compteur remis à zéro
  });

  it('rend les montants dans l’ordre des déplacements reçus', () => {
    const trips = [
      { id: 'late', vehicleId: 'v1', tripDate: d('2026-05-02'), distanceMeters: 1_000, roundTrip: false },
      { id: 'early', vehicleId: 'v1', tripDate: d('2026-05-01'), distanceMeters: 1_000, roundTrip: false },
    ];
    expect(priceTrips(trips, vehicles, new Map()).map((p) => p.id)).toEqual(['late', 'early']);
  });
});
