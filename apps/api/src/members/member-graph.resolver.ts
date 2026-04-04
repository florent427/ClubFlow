import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import {
  AssignedDynamicGroupGraph,
  MemberGraph,
} from './models/member.model';

@Resolver(() => MemberGraph)
export class MemberGraphResolver {
  @ResolveField(() => [AssignedDynamicGroupGraph], {
    description:
      'Groupes dynamiques affectés explicitement (persistés), pour tarif / admin.',
  })
  assignedDynamicGroups(
    @Parent() member: MemberGraph,
  ): AssignedDynamicGroupGraph[] {
    return member.assignedDynamicGroups ?? [];
  }
}
