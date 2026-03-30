import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import type { Request } from 'express';

export const CurrentClub = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Club | undefined => {
    const gqlContext = GqlExecutionContext.create(context);
    const req = gqlContext.getContext().req as Request;
    return req.club;
  },
);
