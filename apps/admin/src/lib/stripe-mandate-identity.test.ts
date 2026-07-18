import { describe, expect, it } from 'vitest';
import { hasMandateNameMismatch, normalizeName } from './stripe-mandate-identity';

describe('hasMandateNameMismatch', () => {
  it('alerte quand la raison sociale Stripe désigne une autre entité', () => {
    // Cas constaté sur staging : le club « QA Test Club » encaisse via un
    // compte connecté nommé « SKSR ». C'est ce nom que l'adhérent signe.
    expect(hasMandateNameMismatch('SKSR', 'QA Test Club')).toBe(true);
  });

  it("n'alerte pas quand les deux noms coïncident", () => {
    expect(hasMandateNameMismatch('SKSR', 'SKSR')).toBe(false);
  });

  it('ignore casse, accents et espaces superflus', () => {
    // Ces écarts n'ont aucun effet sur ce que comprend l'adhérent : alerter
    // dessus banaliserait l'avertissement.
    expect(hasMandateNameMismatch('Club  ÉLAN', 'club elan')).toBe(false);
    expect(hasMandateNameMismatch('  SKSR  ', 'sksr')).toBe(false);
  });

  it("n'alerte pas tant que le KYC n'a pas renseigné la raison sociale", () => {
    // Null = dossier Stripe incomplet, pas une divergence : afficher une
    // alerte à ce stade serait un faux positif.
    expect(hasMandateNameMismatch(null, 'QA Test Club')).toBe(false);
  });

  it('alerte sur une chaîne vide, qui ne désigne aucun club', () => {
    // Distinct de `null` : Stripe a bien un champ, mais vide — l'adhérent ne
    // lira aucun nom reconnaissable.
    expect(hasMandateNameMismatch('', 'QA Test Club')).toBe(true);
  });
});

describe('normalizeName', () => {
  it('décompose les accents et uniformise la casse', () => {
    expect(normalizeName('Élan')).toBe('elan');
  });

  it('réduit les espaces internes et de bord', () => {
    expect(normalizeName('  Club   Élan  ')).toBe('club elan');
  });
});
