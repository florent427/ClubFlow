import { useQuery } from '@apollo/client/react';
import {
  CLUB_MODULES,
  VIEWER_SYSTEM_ROLE,
  type ClubModuleStatus,
  type ModuleCode,
  type SystemRole,
} from '@clubflow/mobile-shared';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { MembershipRole } from '@clubflow/mobile-shared';
import type { ViewerPermissions } from './permissions';

type ClubModulesData = { clubModules: ClubModuleStatus[] };
type ViewerSystemRoleData = { viewerSystemRole: SystemRole | null };

type ViewerContextValue = {
  loading: boolean;
  permissions: ViewerPermissions;
  refresh: () => void;
};

const defaultValue: ViewerContextValue = {
  loading: true,
  permissions: {
    clubRole: null,
    systemRole: null,
    enabledModules: new Set<ModuleCode>(),
  },
  refresh: () => {},
};

const ViewerContext = createContext<ViewerContextValue>(defaultValue);

/**
 * Provider qui charge :
 * - `clubModules` : liste des modules activés sur le club courant
 * - `viewerSystemRole` : rôle système (admin / super-admin)
 *
 * Le rôle club (`MembershipRole`) est généralement déjà connu via la
 * résolution de profil au login ; on le passe via prop `clubRole`.
 */
export function ViewerProvider({
  children,
  clubRole,
}: {
  children: ReactNode;
  clubRole: MembershipRole | null;
}) {
  const modulesQuery = useQuery<ClubModulesData>(CLUB_MODULES, {
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
  });
  const sysRoleQuery = useQuery<ViewerSystemRoleData>(VIEWER_SYSTEM_ROLE, {
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
  });

  const value = useMemo<ViewerContextValue>(() => {
    const enabledModules = new Set<ModuleCode>(
      (modulesQuery.data?.clubModules ?? [])
        .filter((m) => m.enabled)
        .map((m) => m.moduleCode),
    );
    const systemRole = sysRoleQuery.data?.viewerSystemRole ?? null;
    return {
      loading: modulesQuery.loading || sysRoleQuery.loading,
      permissions: { clubRole, systemRole, enabledModules },
      refresh: () => {
        void modulesQuery.refetch();
        void sysRoleQuery.refetch();
      },
    };
  }, [
    modulesQuery.data,
    modulesQuery.loading,
    modulesQuery.refetch,
    sysRoleQuery.data,
    sysRoleQuery.loading,
    sysRoleQuery.refetch,
    clubRole,
  ]);

  return (
    <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>
  );
}

export function useViewer(): ViewerContextValue {
  return useContext(ViewerContext);
}

export function useViewerPermissions(): ViewerPermissions {
  return useViewer().permissions;
}
