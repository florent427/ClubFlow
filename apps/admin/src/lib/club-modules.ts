import type { ModuleCodeStr } from './module-catalog';

export type ClubModuleRow = { moduleCode: string; enabled: boolean };

export function isClubModuleEnabled(
  modules: ClubModuleRow[] | undefined,
  code: ModuleCodeStr,
): boolean {
  const row = modules?.find((m) => m.moduleCode === code);
  return row?.enabled === true;
}
