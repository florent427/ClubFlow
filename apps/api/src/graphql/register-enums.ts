import { registerEnumType } from '@nestjs/graphql';
import { MembershipRole } from '@prisma/client';
import { ModuleCode } from '../domain/module-registry/module-codes';

registerEnumType(MembershipRole, { name: 'MembershipRole' });
registerEnumType(ModuleCode, { name: 'ModuleCode' });
