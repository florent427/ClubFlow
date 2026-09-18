import type { ModuleCodeStr } from './module-catalog';

/** Modules requis (tous true) pour qu’une URL soit accessible. */
export function modulesRequiredForPath(pathname: string): ModuleCodeStr[] {
  if (pathname.startsWith('/members/families')) return ['MEMBERS', 'FAMILIES'];
  if (pathname.startsWith('/members')) return ['MEMBERS'];
  if (pathname.startsWith('/contacts')) return ['MEMBERS'];
  if (pathname.startsWith('/planning')) return ['PLANNING'];
  if (pathname.startsWith('/evenements')) return ['EVENTS'];
  if (pathname.startsWith('/projets')) return ['PROJECTS'];
  if (pathname.startsWith('/reservations')) return ['BOOKING'];
  // La messagerie et les campagnes sont deux modules distincts, activables
  // séparément. Cette règle passe donc avant la règle générale, sinon un club
  // qui a la messagerie sans les campagnes voit le lien du menu, puis se fait
  // renvoyer au tableau de bord.
  if (pathname.startsWith('/communication/messagerie')) return ['MESSAGING'];
  if (pathname.startsWith('/communication')) return ['COMMUNICATION'];
  if (pathname.startsWith('/vie-du-club')) return ['CLUB_LIFE'];
  if (pathname.startsWith('/blog')) return ['BLOG'];
  if (pathname.startsWith('/billing')) return ['PAYMENT'];
  if (pathname.startsWith('/comptabilite')) return ['ACCOUNTING'];
  if (pathname.startsWith('/sponsoring')) return ['SPONSORING'];
  if (pathname.startsWith('/subventions')) return ['SUBSIDIES'];
  if (pathname.startsWith('/boutique')) return ['SHOP'];
  if (pathname.startsWith('/settings/pricing-rules')) return ['PAYMENT'];
  if (pathname.startsWith('/settings/payments')) return ['PAYMENT'];
  if (pathname.startsWith('/settings/accounting')) return ['ACCOUNTING'];
  if (
    pathname === '/settings/adhesion' ||
    pathname.startsWith('/settings/adhesion')
  ) {
    return ['MEMBERS', 'PAYMENT'];
  }
  if (
    pathname === '/settings/mail-domain' ||
    pathname.startsWith('/settings/mail-domain')
  ) {
    return ['COMMUNICATION'];
  }
  if (pathname.startsWith('/settings/member-fields')) return ['MEMBERS'];
  if (pathname.startsWith('/documents')) return ['DOCUMENTS'];
  return [];
}

export function pathAllowed(
  pathname: string,
  isEnabled: (c: ModuleCodeStr) => boolean,
): boolean {
  const need = modulesRequiredForPath(pathname);
  return need.every((c) => isEnabled(c));
}
