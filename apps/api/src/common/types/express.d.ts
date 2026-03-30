import type { Club } from '@prisma/client';
import type { RequestUser } from './request-user';

declare global {
  namespace Express {
    interface Request {
      club?: Club;
      user?: RequestUser;
    }
  }
}

export {};
