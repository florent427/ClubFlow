import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { isContactOnlySession } from '../lib/storage';

/** Redirige les contacts purs vers l’accueil (pas de fiche membre). */
export function MemberOnly({ children }: { children: ReactNode }) {
  if (isContactOnlySession()) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
