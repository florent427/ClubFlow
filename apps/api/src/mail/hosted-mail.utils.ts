/** Suffixe DNS opérateur, ex. mail.clubflow.fr (sans point final). */
export function getClubflowHostedMailSuffix(): string | null {
  const raw = process.env.CLUBFLOW_HOSTED_MAIL_DOMAIN?.trim();
  if (!raw) {
    return null;
  }
  return raw.toLowerCase().replace(/\.$/, '');
}

/** Libellé DNS unique : a-z, 0-9, tirets ; ne commence pas par un chiffre. */
export function slugToMailDnsLabel(slug: string, fallback: string): string {
  let s = slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!s) {
    s = fallback.replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'club';
  }
  if (/^[0-9]/.test(s)) {
    s = `c-${s}`;
  }
  if (s.length > 50) {
    s = s.slice(0, 50).replace(/-+$/, '');
  }
  return s;
}

export function fqdnIsUnderHostedSuffix(fqdn: string, suffix: string): boolean {
  const n = fqdn.trim().toLowerCase().replace(/\.$/, '');
  const suf = suffix.trim().toLowerCase().replace(/\.$/, '');
  return n === suf || n.endsWith('.' + suf);
}
