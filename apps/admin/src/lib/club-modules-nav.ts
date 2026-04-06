import type { ModuleCodeStr } from './module-catalog';

/** Modules requis (tous true) pour qu’une URL soit accessible. */
export function modulesRequiredForPath(pathname: string): ModuleCodeStr[] {
  if (pathname.startsWith('/members/families')) return ['MEMBERS', 'FAMILIES'];
  if (pathname.startsWith('/members')) return ['MEMBERS'];
  if (pathname.startsWith('/contacts')) return ['MEMBERS'];
  if (pathname.startsWith('/planning')) return ['PLANNING'];
  if (pathname.startsWith('/communication')) return ['COMMUNICATION'];
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
  return [];
}

export function pathAllowed(
  pathname: string,
  isEnabled: (c: ModuleCodeStr) => boolean,
): boolean {
  const need = modulesRequiredForPath(pathname);
  return need.every((c) => isEnabled(c));
}
