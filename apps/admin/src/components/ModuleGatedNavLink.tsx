import type { ReactNode } from 'react';
import { NavLink, type NavLinkProps } from 'react-router-dom';
import type { ModuleCodeStr } from '../lib/module-catalog';
import { useClubModules } from '../lib/club-modules-context';

type Props = Omit<NavLinkProps, 'to' | 'children'> & {
  to: string;
  /** Tous requis. */
  modules: ModuleCodeStr[];
  /** Classe ajoutée à l’état désactivé (sidebar vs sous-nav). */
  disabledClassName?: string;
  children: ReactNode;
};

function resolveClassName(
  className: NavLinkProps['className'],
  isActive: boolean,
): string {
  if (typeof className === 'function') {
    return (
      className({
        isActive,
        isPending: false,
        isTransitioning: false,
      }) ?? ''
    );
  }
  return className ?? '';
}

export function ModuleGatedNavLink({
  modules,
  to,
  className,
  children,
  disabledClassName = 'cf-sidenav__link--disabled',
  end,
  ...rest
}: Props) {
  const { isEnabled, loading } = useClubModules();
  /** Pendant le chargement, on ne grise pas (évite un flash tout désactivé). */
  const denied =
    !loading && modules.some((m) => !isEnabled(m));
  const allowed = !denied;

  if (!allowed) {
    const resolved = resolveClassName(className, false);
    return (
      <span
        className={`${resolved} ${disabledClassName}`.trim()}
        aria-disabled="true"
        title="Module désactivé — activez-le dans Modules du club."
      >
        {children}
      </span>
    );
  }

  return (
    <NavLink {...rest} to={to} className={className} end={end}>
      {children}
    </NavLink>
  );
}
