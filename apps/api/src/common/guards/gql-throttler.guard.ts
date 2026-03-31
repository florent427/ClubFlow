import { Injectable, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';

@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  protected override getRequestResponse(context: ExecutionContext): {
    req: Request;
    res: Response;
  } {
    const gql = GqlExecutionContext.create(context);
    const ctx = gql.getContext<{ req: Request; res: Response }>();
    return { req: ctx.req, res: ctx.res };
  }
}
