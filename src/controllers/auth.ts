import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import config from '../config';

function unauthorized(res: Response, message: string): void {
  res.status(401).json({
    error: 'Unauthorized',
    message,
    code: 'AUTH_UNAUTHORIZED',
  });
}

function badRequest(res: Response, message: string): void {
  res.status(400).json({
    error: 'Bad Request',
    message,
    code: 'AUTH_BAD_REQUEST',
  });
}

function getBearerToken(req: Request): { token: string | null; error: string | null } {
  const header = req.headers.authorization;
  if (!header) {
    return { token: null, error: 'missing' };
  }
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return { token: null, error: 'malformed' };
  }
  return { token, error: null };
}

function isTokenAllowed(token: string, allowed: string[]): boolean {
  const provided = Buffer.from(token, 'utf8');
  return allowed.some((candidate) => {
    const expected = Buffer.from(candidate, 'utf8');
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  });
}

function encodeJsonBase64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function signHs256(input: string, secret: string): string {
  return createHmac('sha256', secret).update(input).digest('base64url');
}

function mintJwt(params: { sub: string; role: 'operator' | 'admin' }): { token: string; exp: number } {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + config.jwtTtlSeconds;
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: config.jwtIssuer,
    aud: config.jwtAudience,
    sub: params.sub,
    role: params.role,
    roles: [params.role],
    iat: now,
    nbf: now,
    exp,
    jti: randomUUID(),
  };

  const encodedHeader = encodeJsonBase64Url(header);
  const encodedPayload = encodeJsonBase64Url(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = signHs256(signingInput, config.jwtSecret);
  return { token: `${signingInput}.${signature}`, exp };
}

export class AuthController {
  issueToken(req: Request, res: Response): void {
    const bearerResult = getBearerToken(req);
    if (bearerResult.error === 'missing') {
      unauthorized(res, 'Missing Authorization header');
      return;
    }
    if (bearerResult.error === 'malformed') {
      unauthorized(res, 'Invalid Authorization header format');
      return;
    }
    const accessToken = bearerResult.token!;

    const requestedRoleRaw = (req.body && typeof req.body === 'object') ? (req.body as any).role : undefined;
    const requestedRole = requestedRoleRaw === 'admin' ? 'admin' : 'operator';

    // Prevent privilege escalation: when admin role is requested but ADMIN_TOKENS is not configured,
    // use a generic error to avoid leaking configuration details to unauthenticated requests
    if (requestedRole === 'admin' && config.adminAuthTokens.length === 0) {
      unauthorized(res, 'Invalid authorization token');
      return;
    }

    const allowedTokens =
      requestedRole === 'admin'
        ? config.adminAuthTokens
        : config.operatorAuthTokens;

    if (!isTokenAllowed(accessToken, allowedTokens)) {
      unauthorized(res, 'Invalid authorization token');
      return;
    }

    const requestedSubRaw = (req.body && typeof req.body === 'object') ? (req.body as any).sub : undefined;
    const sub =
      typeof requestedSubRaw === 'string' && requestedSubRaw.trim().length > 0
        ? requestedSubRaw.trim()
        : `mobile:${randomUUID()}`;

    if (sub.length > 128) {
      badRequest(res, 'sub is too long');
      return;
    }

    const minted = mintJwt({ sub, role: requestedRole });
    res.json({
      token: minted.token,
      expiresAt: new Date(minted.exp * 1000).toISOString(),
    });
  }
}

