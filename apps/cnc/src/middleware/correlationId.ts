import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

const CORRELATION_ID_HEADER = 'x-correlation-id';
const GENERATED_PREFIX = 'corr_';
const MAX_LENGTH = 128;

function sanitizeCorrelationId(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_LENGTH) {
    return null;
  }

  return trimmed;
}

export function assignCorrelationId(req: Request, res: Response, next: NextFunction): void {
  const incomingHeader = req.header(CORRELATION_ID_HEADER);
  const correlationId = sanitizeCorrelationId(incomingHeader) ?? `${GENERATED_PREFIX}${randomUUID()}`;

  req.correlationId = correlationId;
  res.setHeader('X-Correlation-Id', correlationId);
  next();
}
