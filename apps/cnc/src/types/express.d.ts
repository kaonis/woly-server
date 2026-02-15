import type { AuthContext } from './auth';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      correlationId?: string;
    }
  }
}

export {};
