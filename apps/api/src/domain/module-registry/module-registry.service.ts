import { BadRequestException, Injectable } from '@nestjs/common';
import { ModuleCode } from './module-codes';
import { ENABLE_REQUIRES } from './module-dependencies';

@Injectable()
export class ModuleRegistryService {
  assertCanEnable(target: ModuleCode, enabled: Set<ModuleCode>): void {
    const missing = (ENABLE_REQUIRES[target] ?? []).filter(
      (code) => !enabled.has(code),
    );
    if (missing.length) {
      throw new BadRequestException(
        `Cannot enable ${target}: missing ${missing.join(', ')}`,
      );
    }
  }

  assertCanDisable(target: ModuleCode, enabled: Set<ModuleCode>): void {
    const dependents = Object.entries(ENABLE_REQUIRES)
      .filter(([, reqs]) => reqs.includes(target))
      .map(([code]) => code as ModuleCode)
      .filter((code) => enabled.has(code));
    if (dependents.length) {
      throw new BadRequestException(
        `Cannot disable ${target}: required by ${dependents.join(', ')}`,
      );
    }
  }
}
