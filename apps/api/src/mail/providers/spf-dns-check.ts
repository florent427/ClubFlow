import { promises as dns } from 'node:dns';

export type TxtResolver = (hostname: string) => Promise<string[][]>;

export function normalizeIpv4(ip: string): string {
  const t = ip.trim();
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(t)) {
    return '';
  }
  const parts = t.split('.').map((p) => parseInt(p, 10));
  if (parts.some((n) => n > 255)) {
    return '';
  }
  return parts.join('.');
}

/**
 * MVP : un enregistrement TXT SPF sur le FQDN exact doit contenir le mécanisme
 * `ip4:<egressIp>` (sans résolution include:/a/mx).
 */
export async function spfTxtIncludesIp4(
  fqdn: string,
  egressIp: string,
  resolveTxt: TxtResolver = dns.resolveTxt,
): Promise<boolean> {
  const ip = normalizeIpv4(egressIp);
  if (!ip || !fqdn.trim()) {
    return false;
  }
  const normFqdn = fqdn.trim().toLowerCase().replace(/\.$/, '');
  let rows: string[][];
  try {
    rows = await resolveTxt(normFqdn);
  } catch {
    return false;
  }
  const flattened = rows.map((chunks) => chunks.join('')).map((s) => s.trim());
  const spf = flattened.find((s) => s.toLowerCase().startsWith('v=spf1'));
  if (!spf) {
    return false;
  }
  const re = new RegExp(
    `(?:^|\\s)ip4:${ip.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:/|\\s|$)`,
    'i',
  );
  return re.test(spf);
}
