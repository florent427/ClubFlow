import { describe, expect, it } from 'vitest';
import {
  blockLabel,
  emptyLike,
  fieldLabel,
  isLongText,
  isMediaField,
  itemSummary,
  moveItem,
  orderedEntries,
  removeItem,
} from './section-form';

describe('libellés', () => {
  it('nomme les blocs connus et rend lisible un bloc inconnu', () => {
    expect(blockLabel('sksrVoie')).toBe('Dōjō-kun (préceptes)');
    expect(blockLabel('sksrNouveauBloc')).toBe('Nouveau bloc');
  });

  it('traduit les champs connus et rend lisible un champ inconnu', () => {
    expect(fieldLabel('ctaLabel')).toBe('Texte du bouton');
    expect(fieldLabel('titleLineAEm')).toBe('Titre, ligne 1 en italique');
    expect(fieldLabel('heroMotto')).toBe('Hero motto');
  });
});

describe('nature des champs', () => {
  it('reconnaît une image par son nom ou par la liste de photos qui la porte', () => {
    expect(isMediaField('imageUrl')).toBe(true);
    expect(isMediaField('logoUrl')).toBe(true);
    expect(isMediaField('url', 'photos')).toBe(true);
  });

  it("ne prend pour une image ni un lien ni l'adresse d'une carte", () => {
    expect(isMediaField('url', 'links')).toBe(false);
    expect(isMediaField('url')).toBe(false);
    expect(isMediaField('mapEmbedUrl')).toBe(false);
    expect(isMediaField('href', 'photos')).toBe(false);
  });

  it('ouvre une zone de texte pour une description, un long texte ou un retour à la ligne', () => {
    expect(isLongText('desc', 'court')).toBe(true);
    expect(isLongText('title', 'x'.repeat(91))).toBe(true);
    expect(isLongText('title', 'a\nb')).toBe(true);
    expect(isLongText('title', 'Court')).toBe(false);
  });
});

describe('itemSummary', () => {
  it('prend le titre, sinon le premier texte qui ne soit pas une adresse', () => {
    expect(itemSummary({ url: '/media/x', title: 'Kata' }, 0)).toBe('Kata');
    expect(itemSummary({ url: 'https://x', age: '6-9 ans' }, 0)).toBe('6-9 ans');
    expect(itemSummary({ url: 'https://x' }, 2)).toBe('Élément 3');
    expect(itemSummary('  ', 0)).toBe('Élément 1');
  });
});

describe('orderedEntries', () => {
  it('suit l’ordre de lecture, garde l’ordre du JSON ailleurs, met les listes à la fin et cache les identifiants', () => {
    const keys = orderedEntries({
      id: 'x',
      items: [],
      ctaHref: '/dojo',
      zeta: 'z',
      title: 'Un lieu.',
      alpha: 'a',
      label: 'Le Dojo',
    }).map(([k]) => k);
    expect(keys).toEqual(['label', 'title', 'ctaHref', 'zeta', 'alpha', 'items']);
  });
});

describe('emptyLike', () => {
  it('garde les clés, remet les valeurs à zéro et vide les listes', () => {
    expect(
      emptyLike({ num: '01', count: 4, featured: true, tags: ['a'], cta: { label: 'Go' } }),
    ).toEqual({ num: '', count: 0, featured: false, tags: [], cta: { label: '' } });
  });
});

describe('listes', () => {
  it('déplace et retire un élément', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(removeItem(['a', 'b', 'c'], 1)).toEqual(['a', 'c']);
  });
});
