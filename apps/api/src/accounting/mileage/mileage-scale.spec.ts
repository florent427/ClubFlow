import { MileageVehicleKind } from '@prisma/client';
import {
  annualAmountCents,
  firstBracketRateMilli,
  incrementCents,
  resolveScale,
} from './mileage-scale';

const car5 = { kind: MileageVehicleKind.CAR, fiscalHorsepower: 5, isElectric: false };

describe('barème kilométrique', () => {
  it('choisit la ligne selon le type et la puissance fiscale', () => {
    expect(resolveScale({ ...car5, fiscalHorsepower: 3 }, 2025).label).toBe('Voiture 3 CV et moins');
    expect(resolveScale({ ...car5, fiscalHorsepower: 1 }, 2025).label).toBe('Voiture 3 CV et moins');
    expect(resolveScale(car5, 2025).label).toBe('Voiture 5 CV');
    expect(resolveScale({ ...car5, fiscalHorsepower: 11 }, 2025).label).toBe('Voiture 7 CV et plus');
    expect(
      resolveScale({ kind: MileageVehicleKind.MOTORCYCLE, fiscalHorsepower: 4, isElectric: false }, 2025).label,
    ).toBe('Moto 3, 4 ou 5 CV');
    // La puissance d'un cyclomoteur n'entre pas en jeu.
    expect(
      resolveScale({ kind: MileageVehicleKind.MOPED, fiscalHorsepower: 9, isElectric: false }, 2025).label,
    ).toBe('Cyclomoteur (50 cm³ et moins)');
  });

  it('applique la tranche où tombe la distance annuelle', () => {
    const s = resolveScale(car5, 2025);
    // 1 000 km × 0,636 €
    expect(annualAmountCents(s, 1_000_000)).toBe(63_600);
    // 10 000 km × 0,357 € + 1 395 €
    expect(annualAmountCents(s, 10_000_000)).toBe(357_000 + 139_500);
    // 25 000 km × 0,427 €
    expect(annualAmountCents(s, 25_000_000)).toBe(1_067_500);
    expect(annualAmountCents(s, 0)).toBe(0);
  });

  it("un trajet vaut ce qu'il ajoute au montant de l'année", () => {
    const s = resolveScale(car5, 2025);
    // Sous 5 000 km : taux plein.
    expect(incrementCents(s, 0, 100_000)).toBe(6_360);
    // Au-delà, la tranche dégressive s'applique au supplément.
    expect(incrementCents(s, 10_000_000, 100_000)).toBe(3_570);
    // Les incréments se télescopent : la somme vaut le montant de l'année.
    const a = incrementCents(s, 0, 4_000_000);
    const b = incrementCents(s, 4_000_000, 3_000_000);
    expect(a + b).toBe(annualAmountCents(s, 7_000_000));
  });

  it('majore de 20 % un véhicule électrique', () => {
    const s = resolveScale({ ...car5, isElectric: true }, 2025);
    expect(annualAmountCents(s, 1_000_000)).toBe(76_320);
    expect(firstBracketRateMilli(s)).toBe(763);
    expect(s.label).toBe('Voiture 5 CV électrique');
  });

  it("signale une année sans barème publié et prend le dernier connu", () => {
    const s = resolveScale(car5, 2031);
    expect(s.provisional).toBe(true);
    expect(s.scaleYear).toBe(2026);
    expect(resolveScale(car5, 2026).provisional).toBe(false);
  });
});
