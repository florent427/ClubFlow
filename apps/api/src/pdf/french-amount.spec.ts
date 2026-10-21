import { centsToFrenchWords, integerToFrench } from './french-amount';

describe('montant en toutes lettres', () => {
  it.each([
    [0, 'zéro'],
    [1, 'un'],
    [16, 'seize'],
    [17, 'dix-sept'],
    [21, 'vingt et un'],
    [22, 'vingt-deux'],
    [71, 'soixante et onze'],
    [72, 'soixante-douze'],
    [80, 'quatre-vingts'],
    [81, 'quatre-vingt-un'],
    [91, 'quatre-vingt-onze'],
    [99, 'quatre-vingt-dix-neuf'],
    [100, 'cent'],
    [101, 'cent un'],
    [200, 'deux cents'],
    [201, 'deux cent un'],
    [1000, 'mille'],
    [1080, 'mille quatre-vingts'],
    [2000, 'deux mille'],
    [80_000, 'quatre-vingt mille'],
    [200_000, 'deux cent mille'],
    [1_234_567, 'un million deux cent trente-quatre mille cinq cent soixante-sept'],
  ])('%i → %s', (n, words) => {
    expect(integerToFrench(n)).toBe(words);
  });

  it('écrit euros et centimes', () => {
    expect(centsToFrenchWords(12_345)).toBe('cent vingt-trois euros et quarante-cinq centimes');
    expect(centsToFrenchWords(100)).toBe('un euro');
    expect(centsToFrenchWords(101)).toBe('un euro et un centime');
    expect(centsToFrenchWords(50)).toBe('zéro euro et cinquante centimes');
  });
});
