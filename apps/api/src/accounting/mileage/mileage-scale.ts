import { MileageVehicleKind } from '@prisma/client';

/**
 * Barème kilométrique fiscal (URSSAF / impôts) : ce que vaut un kilomètre
 * selon le type de véhicule, sa puissance fiscale et la distance parcourue
 * DANS L'ANNÉE avec ce véhicule.
 *
 * Le barème est dégressif par tranches : le montant d'une année est
 * `d × a + b` pour la tranche où tombe la distance annuelle `d`. Un trajet
 * ne vaut donc pas un prix fixe au km : il vaut la différence entre le
 * montant de l'année avec et sans lui. C'est ce que fait `incrementCents`.
 *
 * Les taux sont en millièmes d'euro par km (0,636 €/km = 636) et les parts
 * fixes en centimes, pour rester en entiers.
 */

interface Bracket {
  /** Borne haute de la tranche en km (incluse) ; null = au-delà. */
  upToKm: number | null;
  /** Taux en millièmes d'euro par km. */
  rateMilli: number;
  /** Part fixe annuelle en centimes. */
  fixedCents: number;
}

interface ScaleRow {
  kind: MileageVehicleKind;
  /** Puissance fiscale minimale couverte (incluse). */
  minCv: number;
  /** Puissance fiscale maximale couverte (incluse) ; null = et plus. */
  maxCv: number | null;
  label: string;
  brackets: Bracket[];
}

const car = (minCv: number, maxCv: number | null, label: string, a: number, b: number, bFixed: number, c: number): ScaleRow => ({
  kind: MileageVehicleKind.CAR,
  minCv,
  maxCv,
  label,
  brackets: [
    { upToKm: 5000, rateMilli: a, fixedCents: 0 },
    { upToKm: 20000, rateMilli: b, fixedCents: bFixed },
    { upToKm: null, rateMilli: c, fixedCents: 0 },
  ],
});

const twoWheels = (kind: MileageVehicleKind, minCv: number, maxCv: number | null, label: string, a: number, b: number, bFixed: number, c: number): ScaleRow => ({
  kind,
  minCv,
  maxCv,
  label,
  brackets: [
    { upToKm: 3000, rateMilli: a, fixedCents: 0 },
    { upToKm: 6000, rateMilli: b, fixedCents: bFixed },
    { upToKm: null, rateMilli: c, fixedCents: 0 },
  ],
});

/**
 * Barème publié pour les revenus 2023, reconduit à l'identique pour 2024 et
 * 2025. À compléter chaque printemps quand l'administration publie le
 * suivant : une année absente prend le dernier barème connu, signalé comme
 * provisoire.
 */
const SCALE_2024: ScaleRow[] = [
  car(0, 3, 'Voiture 3 CV et moins', 529, 316, 106_500, 370),
  car(4, 4, 'Voiture 4 CV', 606, 340, 133_000, 407),
  car(5, 5, 'Voiture 5 CV', 636, 357, 139_500, 427),
  car(6, 6, 'Voiture 6 CV', 665, 374, 145_700, 447),
  car(7, null, 'Voiture 7 CV et plus', 697, 394, 151_500, 470),
  twoWheels(MileageVehicleKind.MOTORCYCLE, 0, 2, 'Moto 1 ou 2 CV', 395, 99, 89_100, 248),
  twoWheels(MileageVehicleKind.MOTORCYCLE, 3, 5, 'Moto 3, 4 ou 5 CV', 468, 82, 115_800, 275),
  twoWheels(MileageVehicleKind.MOTORCYCLE, 6, null, 'Moto plus de 5 CV', 606, 79, 158_300, 343),
  twoWheels(MileageVehicleKind.MOPED, 0, null, 'Cyclomoteur (50 cm³ et moins)', 315, 79, 71_100, 198),
];

const SCALES: Record<number, ScaleRow[]> = {
  2023: SCALE_2024,
  2024: SCALE_2024,
  2025: SCALE_2024,
};

/** Majoration des véhicules 100 % électriques, en pour cent. */
export const ELECTRIC_BONUS_PERCENT = 20;

export interface MileageVehicleSpec {
  kind: MileageVehicleKind;
  /** Puissance fiscale (CV) ; ignorée pour un cyclomoteur. */
  fiscalHorsepower: number | null;
  isElectric: boolean;
}

export interface ResolvedScale {
  /** Année du barème réellement appliqué. */
  scaleYear: number;
  /** Vrai si l'année demandée n'a pas encore de barème publié. */
  provisional: boolean;
  label: string;
  brackets: Bracket[];
  isElectric: boolean;
}

export function knownScaleYears(): number[] {
  return Object.keys(SCALES)
    .map(Number)
    .sort((a, b) => a - b);
}

/** Le barème d'un véhicule pour une année de trajets. */
export function resolveScale(spec: MileageVehicleSpec, year: number): ResolvedScale {
  const years = knownScaleYears();
  let scaleYear = years[0];
  for (const y of years) if (y <= year) scaleYear = y;
  // Une année antérieure au premier barème connu prend le premier : mieux
  // qu'une erreur pour une note très ancienne, et elle reste provisoire.
  const provisional = !(year in SCALES);
  const cv = spec.kind === MileageVehicleKind.MOPED ? 0 : (spec.fiscalHorsepower ?? 0);
  const row = SCALES[scaleYear].find(
    (r) => r.kind === spec.kind && cv >= r.minCv && (r.maxCv === null || cv <= r.maxCv),
  );
  if (!row) {
    throw new Error(`Aucune ligne du barème pour ${spec.kind} ${cv} CV`);
  }
  return {
    scaleYear,
    provisional,
    label: row.label + (spec.isElectric ? ' électrique' : ''),
    brackets: row.brackets,
    isElectric: spec.isElectric,
  };
}

/**
 * Montant annuel du barème pour `meters` parcourus dans l'année, en
 * centimes, majoration électrique comprise.
 */
export function annualAmountCents(scale: ResolvedScale, meters: number): number {
  if (meters <= 0) return 0;
  const km = meters / 1000;
  const bracket =
    scale.brackets.find((b) => b.upToKm === null || km <= b.upToKm) ??
    scale.brackets[scale.brackets.length - 1];
  // meters × millièmes €/km / 10 000 = centimes.
  const base = (meters * bracket.rateMilli) / 10_000 + bracket.fixedCents;
  const withBonus = scale.isElectric ? (base * (100 + ELECTRIC_BONUS_PERCENT)) / 100 : base;
  return Math.round(withBonus);
}

/**
 * Ce que valent `meters` de plus quand `alreadyMeters` ont déjà été
 * indemnisés dans l'année avec le même véhicule.
 */
export function incrementCents(scale: ResolvedScale, alreadyMeters: number, meters: number): number {
  return (
    annualAmountCents(scale, alreadyMeters + meters) - annualAmountCents(scale, alreadyMeters)
  );
}

/** Taux de la première tranche en millièmes d'euro par km, majoré si électrique : pour l'affichage. */
export function firstBracketRateMilli(scale: ResolvedScale): number {
  const rate = scale.brackets[0].rateMilli;
  return scale.isElectric ? Math.round((rate * (100 + ELECTRIC_BONUS_PERCENT)) / 100) : rate;
}
