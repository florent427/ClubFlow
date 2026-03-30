import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { RequestUser } from '../types/request-user';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestUser | undefined => {
    const gqlContext = GqlExecutionContext.create(context);
    const req = gqlContext.getContext().req as Express.Request;
    return req.user as RequestUser | undefined;
  },
);
