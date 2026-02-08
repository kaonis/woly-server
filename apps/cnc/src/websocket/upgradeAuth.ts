import { IncomingMessage } from 'http';
import { timingSafeEqual } from 'crypto';
import config from '../config';
import { extractNodeAuthToken } from './auth';
import { verifyWsSessionToken } from './sessionTokens';

export type WsUpgradeAuthContext =
  | { kind: 'static-token'; token: string }
  | { kind: 'session-token'; token: string; nodeId: string; expiresAt: number };

/**
 * Constant-time comparison of a candidate token against a list of valid tokens.
 * Prevents timing side-channel attacks that could leak token bytes.
 */
export function matchesStaticToken(candidate: string, validTokens: string[]): boolean {
  const candidateBuf = Buffer.from(candidate);
  for (const valid of validTokens) {
    const validBuf = Buffer.from(valid);
    if (candidateBuf.length === validBuf.length && timingSafeEqual(candidateBuf, validBuf)) {
      return true;
    }
  }
  return false;
}

export function authenticateWsUpgrade(request: IncomingMessage): WsUpgradeAuthContext | null {
  const token = extractNodeAuthToken(request, {
    allowQueryTokenAuth: config.wsAllowQueryTokenAuth,
  });

  if (!token) {
    return null;
  }

  if (matchesStaticToken(token, config.nodeAuthTokens)) {
    return { kind: 'static-token', token };
  }

  try {
    const claims = verifyWsSessionToken(token, {
      issuer: config.wsSessionTokenIssuer,
      audience: config.wsSessionTokenAudience,
      ttlSeconds: config.wsSessionTokenTtlSeconds,
      secrets: config.wsSessionTokenSecrets,
    });
    return { kind: 'session-token', token, nodeId: claims.nodeId, expiresAt: claims.expiresAt };
  } catch {
    return null;
  }
}

