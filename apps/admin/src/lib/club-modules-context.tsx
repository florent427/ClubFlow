import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { useQuery } from '@apollo/client/react';
import { CLUB_MODULES } from './documents';
import type { ClubModulesQueryData } from './types';
import type { ModuleCodeStr } from './module-catalog';

export type ClubModulesContextValue = {
  loading: boolean;
  clubModules: ClubModulesQueryData['clubModules'] | undefined;
  isEnabled: (code: ModuleCodeStr) => boolean;
};

const ClubModulesContext = createContext<ClubModulesContextValue | null>(null);

export function ClubModulesProvider({ children }: { children: ReactNode }) {
  const { data, loading } = useQuery<ClubModulesQueryData>(CLUB_MODULES, {
    fetchPolicy: 'cache-and-network',
    nextFetchPolicy: 'cache-first',
  });

  const clubModules = data?.clubModules;

  const isEnabled = useCallback(
    (code: ModuleCodeStr) =>
      clubModules?.some((m) => m.moduleCode === code && m.enabled) === true,
    [clubModules],
  );

  const value = useMemo(
    () => ({ loading, clubModules, isEnabled }),
    [loading, clubModules, isEnabled],
  );

  return (
    <ClubModulesContext.Provider value={value}>
      {children}
    </ClubModulesContext.Provider>
  );
}

export function useClubModules(): ClubModulesContextValue {
  const ctx = useContext(ClubModulesContext);
  if (!ctx) {
    throw new Error('useClubModules doit être utilisé sous ClubModulesProvider');
  }
  return ctx;
}
