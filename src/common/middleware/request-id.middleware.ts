import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

const REQUEST_ID_HEADER = 'x-request-id';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const headerValue = req.header(REQUEST_ID_HEADER);
  const requestId = headerValue && headerValue.trim().length > 0 ? headerValue : randomUUID();

  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  next();
}
