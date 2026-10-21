/**
 * Montant en toutes lettres, comme l'exige le reçu fiscal (Cerfa 11580) :
 * « cent vingt-trois euros et quarante-cinq centimes ». Orthographe
 * traditionnelle (traits d'union sous cent, « et » devant un et onze).
 */

const UNITS = [
  'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
];
const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

/** 0 à 99. */
function below100(n: number): string {
  if (n <= 16) return UNITS[n];
  if (n < 20) return `dix-${UNITS[n - 10]}`;
  if (n < 70) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    if (u === 0) return TENS[t];
    if (u === 1) return `${TENS[t]} et un`;
    return `${TENS[t]}-${UNITS[u]}`;
  }
  if (n < 80) {
    // 70-79 : soixante-dix, soixante et onze, soixante-douze…
    const r = n - 60;
    return r === 11 ? 'soixante et onze' : `soixante-${below100(r)}`;
  }
  // 80-99 : quatre-vingts, quatre-vingt-un, quatre-vingt-dix…
  const r = n - 80;
  return r === 0 ? 'quatre-vingts' : `quatre-vingt-${below100(r)}`;
}

/** 0 à 999 ; `final` = le nombre n'est suivi de rien (accord de « cents »). */
function below1000(n: number, final: boolean): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  let out = '';
  if (h === 1) out = 'cent';
  else if (h > 1) out = `${UNITS[h]} cent${r === 0 && final ? 's' : ''}`;
  if (r > 0) {
    // « quatre-vingts » perd son s quand il n'est pas final (quatre-vingt mille).
    const tail = r === 80 && !final ? 'quatre-vingt' : below100(r);
    out = out ? `${out} ${tail}` : tail;
  }
  return out || 'zéro';
}

export function integerToFrench(n: number): string {
  if (!Number.isInteger(n) || n < 0) throw new Error(`Entier positif attendu : ${n}`);
  if (n === 0) return 'zéro';
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions > 0) {
    parts.push(`${below1000(millions, true)} million${millions > 1 ? 's' : ''}`);
  }
  if (thousands > 0) {
    parts.push(thousands === 1 ? 'mille' : `${below1000(thousands, false)} mille`);
  }
  if (rest > 0) parts.push(below1000(rest, true));
  return parts.join(' ');
}

export function centsToFrenchWords(cents: number): string {
  const euros = Math.floor(cents / 100);
  const c = cents % 100;
  const e = `${integerToFrench(euros)} euro${euros > 1 ? 's' : ''}`;
  if (c === 0) return e;
  return `${e} et ${integerToFrench(c)} centime${c > 1 ? 's' : ''}`;
}
