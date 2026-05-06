import type { ModuleCode } from './module-codes';

export type ClubModuleStatus = {
  moduleCode: ModuleCode;
  enabled: boolean;
  enabledAt: string | null;
  disabledAt: string | null;
};

export type ClubBranding = {
  id: string;
  name: string;
  logoUrl: string | null;
  tagline: string | null;
  palette: {
    ink: string | null;
    ink2: string | null;
    paper: string | null;
    accent: string | null;
    goldBright: string | null;
    vermillion: string | null;
    line: string | null;
    muted: string | null;
  } | null;
};
