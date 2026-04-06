import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useClubModules } from '../lib/club-modules-context';
import { pathAllowed } from '../lib/club-modules-nav';

export function ModuleRouteGuard({ children }: { children: ReactNode }) {
  const { isEnabled, loading } = useClubModules();
  const { pathname } = useLocation();

  if (loading) {
    return <div className="cf-dash">Chargement…</div>;
  }

  if (!pathAllowed(pathname, isEnabled)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
