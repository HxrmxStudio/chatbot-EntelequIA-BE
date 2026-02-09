import 'express';

declare module 'express-serve-static-core' {
  interface Request {
    rawBody?: string;
    requestId?: string;
    externalEventId?: string;
  }
}
