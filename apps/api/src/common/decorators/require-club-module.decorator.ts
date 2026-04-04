import { SetMetadata } from '@nestjs/common';
import { ModuleCode } from '../../domain/module-registry/module-codes';

export const REQUIRE_CLUB_MODULE_KEY = 'requireClubModule';

export const RequireClubModule = (code: ModuleCode) =>
  SetMetadata(REQUIRE_CLUB_MODULE_KEY, code);
