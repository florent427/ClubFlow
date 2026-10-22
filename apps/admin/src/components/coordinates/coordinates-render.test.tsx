import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AddressFields } from './AddressFields';
import { BirthPlaceField } from './BirthPlaceField';
import { PhoneField } from './PhoneField';

/**
 * Rendu des champs de coordonnées : un import cassé (drapeaux, locale) ou un
 * ancien numéro mal converti ne se voit pas au typecheck.
 */
describe('champs de coordonnées (rendu)', () => {
  it('affiche un ancien numéro réunionnais converti, avec La Réunion en tête', () => {
    const html = renderToStaticMarkup(
      <PhoneField value="0692 12 34 56" onChange={() => {}} />,
    );
    expect(html).toContain('+262 692 12 34 56');
    expect(html).toContain('indicatif déduit');
    const reunion = html.indexOf('value="RE"');
    const france = html.indexOf('value="FR"');
    const afghanistan = html.indexOf('value="AF"');
    expect(reunion).toBeGreaterThan(-1);
    expect(france).toBeGreaterThan(reunion);
    expect(afghanistan).toBeGreaterThan(france);
  });

  it('signale un numéro enregistré inexploitable sans le perdre', () => {
    const html = renderToStaticMarkup(
      <PhoneField value="n/c" onChange={() => {}} />,
    );
    expect(html).toContain('non reconnu');
    expect(html).toContain('n/c');
  });

  it('lieu de naissance à l’étranger : liste des pays en français', () => {
    const html = renderToStaticMarkup(
      <BirthPlaceField
        value={{ birthCity: 'Antananarivo', birthCityInseeCode: '', birthCountryCode: 'MG' }}
        onChange={() => {}}
      />,
    );
    expect(html).toContain('Madagascar');
    expect(html).toMatch(/value="MG" selected=""/);
    expect(html).toContain('Antananarivo');
  });

  it('commune française saisie sans code INSEE : indication affichée', () => {
    const html = renderToStaticMarkup(
      <BirthPlaceField
        value={{ birthCity: 'Bourg-Murat', birthCityInseeCode: '', birthCountryCode: 'FR' }}
        onChange={() => {}}
      />,
    );
    expect(html).toContain('sans code INSEE');
  });

  it('adresse : trois champs pré-remplis', () => {
    const html = renderToStaticMarkup(
      <AddressFields
        value={{ addressLine: '1 rue A', postalCode: '97400', city: 'Saint-Denis' }}
        onChange={() => {}}
      />,
    );
    expect(html).toContain('value="1 rue A"');
    expect(html).toContain('value="97400"');
    expect(html).toContain('value="Saint-Denis"');
  });
});
