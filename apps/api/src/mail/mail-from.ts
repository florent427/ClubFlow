/**
 * Construit l’objet From pour Nodemailer (évite les en-têtes mal formés
 * rejetés par Brevo / Postfix, ex. virgule dans le nom sans guillemets).
 */
export type SmtpMailFrom = { name: string; address: string };

export function normalizeMailFqdn(fqdn: string): string {
  return fqdn.trim().toLowerCase().replace(/\.$/, '');
}

export function buildSmtpMailFrom(
  clubName: string,
  fqdn: string,
  localPart: string,
): SmtpMailFrom {
  const host = normalizeMailFqdn(fqdn);
  let lp = (localPart || 'noreply').trim().toLowerCase();
  if (!lp || lp.includes('@') || /[\s"<>]/.test(lp) || !/^[a-z0-9._+-]+$/.test(lp)) {
    lp = 'noreply';
  }
  const address = `${lp}@${host}`;
  let name = clubName
    .replace(/\r\n|\r|\n/g, ' ')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/["<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name) {
    name = 'Club';
  }
  if (name.length > 200) {
    name = `${name.slice(0, 197)}...`;
  }
  return { name, address };
}
