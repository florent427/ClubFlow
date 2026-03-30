import { ModuleCode } from './module-codes';

/** Prérequis pour *activer* un module (selon section 5.2 du doc de conception). */
export const ENABLE_REQUIRES: Record<ModuleCode, ModuleCode[]> = {
  [ModuleCode.MEMBERS]: [],
  [ModuleCode.PAYMENT]: [ModuleCode.MEMBERS],
  [ModuleCode.PLANNING]: [ModuleCode.MEMBERS],
  [ModuleCode.COMMUNICATION]: [ModuleCode.MEMBERS],
  [ModuleCode.ACCOUNTING]: [ModuleCode.PAYMENT],
  [ModuleCode.SUBSIDIES]: [ModuleCode.ACCOUNTING],
  [ModuleCode.SPONSORING]: [ModuleCode.ACCOUNTING],
  [ModuleCode.WEBSITE]: [],
  [ModuleCode.BLOG]: [ModuleCode.WEBSITE],
  [ModuleCode.SHOP]: [ModuleCode.WEBSITE, ModuleCode.PAYMENT],
  [ModuleCode.CLUB_LIFE]: [ModuleCode.MEMBERS],
  [ModuleCode.EVENTS]: [ModuleCode.MEMBERS],
  [ModuleCode.BOOKING]: [ModuleCode.MEMBERS],
};
