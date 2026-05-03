import type {
  MembershipRole,
  ModuleCode,
  SystemRole,
} from '@clubflow/mobile-shared';

export type ViewerPermissions = {
  /** Rôle dans le club courant (null si user système sans membership). */
  clubRole: MembershipRole | null;
  /** Rôle système (null si simple membre). */
  systemRole: SystemRole | null;
  /** Modules activés sur le club courant. */
  enabledModules: ReadonlySet<ModuleCode>;
};

export function isSystemAdmin(p: ViewerPermissions): boolean {
  return p.systemRole === 'ADMIN' || p.systemRole === 'SUPER_ADMIN';
}

export function isSuperAdmin(p: ViewerPermissions): boolean {
  return p.systemRole === 'SUPER_ADMIN';
}

export function canAccessAdminCore(p: ViewerPermissions): boolean {
  if (isSystemAdmin(p)) return true;
  return (
    p.clubRole === 'CLUB_ADMIN' ||
    p.clubRole === 'BOARD' ||
    p.clubRole === 'TREASURER'
  );
}

export function canAccessAccounting(p: ViewerPermissions): boolean {
  return canAccessAdminCore(p);
}

export function canAccessVitrine(p: ViewerPermissions): boolean {
  if (canAccessAdminCore(p)) return true;
  return p.clubRole === 'COMM_MANAGER';
}

export function canAccessSystem(p: ViewerPermissions): boolean {
  return isSystemAdmin(p);
}

export function isModuleEnabled(
  p: ViewerPermissions,
  code: ModuleCode,
): boolean {
  return p.enabledModules.has(code);
}
