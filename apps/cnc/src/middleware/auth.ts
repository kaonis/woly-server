import { createHmac, timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import config from '../config';
import { JwtPayload } from '../types/auth';

interface JwtVerifyOptions {
  issuer: string;
  audience: string;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(normalized + padding, 'base64').toString('utf8');
}

function parsePayload(token: string): JwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT');
  }

  const [encodedHeader, encodedPayload] = parts;
  const headerJson = decodeBase64Url(encodedHeader);
  const payloadJson = decodeBase64Url(encodedPayload);
  const header = JSON.parse(headerJson) as { alg?: string; typ?: string };
  const payload = JSON.parse(payloadJson) as JwtPayload;

  if (header.alg !== 'HS256') {
    throw new Error('Unsupported JWT algorithm');
  }

  return payload;
}

function verifySignature(token: string, secret: string): void {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64url');

  const provided = Buffer.from(encodedSignature, 'utf8');
  const expected = Buffer.from(expectedSignature, 'utf8');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new Error('Invalid JWT signature');
  }
}

function toStringClaim(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function validatePayload(payload: JwtPayload, options: JwtVerifyOptions): void {
  const nowSec = Math.floor(Date.now() / 1000);
  const issuer = toStringClaim(payload.iss);
  const audience = toStringClaim(payload.aud);
  const expiresAt = typeof payload.exp === 'number' ? payload.exp : null;
  const notBefore = typeof payload.nbf === 'number' ? payload.nbf : null;

  if (!issuer || issuer !== options.issuer) {
    throw new Error('Invalid JWT issuer');
  }

  if (!audience || audience !== options.audience) {
    throw new Error('Invalid JWT audience');
  }

  if (!expiresAt || nowSec >= expiresAt) {
    throw new Error('JWT expired');
  }

  if (notBefore && nowSec < notBefore) {
    throw new Error('JWT not active yet');
  }
}

function getBearerToken(req: Request): string {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    throw new Error('Missing Authorization header');
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new Error('Invalid Authorization header format');
  }

  return token;
}

function extractRoles(payload: JwtPayload): string[] {
  const role = toStringClaim(payload.role);
  const roles = Array.isArray(payload.roles)
    ? payload.roles.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];

  const merged = role ? [role, ...roles] : roles;
  return Array.from(new Set(merged));
}

function unauthorized(res: Response, message: string): void {
  res.status(401).json({
    error: 'Unauthorized',
    message,
    code: 'AUTH_UNAUTHORIZED',
  });
}

function forbidden(res: Response, message: string): void {
  res.status(403).json({
    error: 'Forbidden',
    message,
    code: 'AUTH_FORBIDDEN',
  });
}

export function authenticateJwt(req: Request, res: Response, next: NextFunction): void {
  try {
    const token = getBearerToken(req);
    verifySignature(token, config.jwtSecret);
    const payload = parsePayload(token);
    validatePayload(payload, {
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
    });

    const subject = toStringClaim(payload.sub);
    if (!subject) {
      unauthorized(res, 'Token subject is required');
      return;
    }

    req.auth = {
      sub: subject,
      roles: extractRoles(payload),
      claims: payload,
    };
    next();
  } catch (error) {
    unauthorized(res, error instanceof Error ? error.message : 'Invalid token');
  }
}

export function authorizeRoles(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      unauthorized(res, 'Authentication required');
      return;
    }

    const hasAllowedRole = req.auth.roles.some((role) => allowedRoles.includes(role));
    if (!hasAllowedRole) {
      forbidden(res, `Required role: ${allowedRoles.join(' or ')}`);
      return;
    }

    next();
  };
}
