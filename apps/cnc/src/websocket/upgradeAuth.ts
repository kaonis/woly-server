import { IncomingMessage } from 'http';
import config from '../config';
import { extractNodeAuthToken } from './auth';
import { verifyWsSessionToken } from './sessionTokens';

export type WsUpgradeAuthContext =
  | { kind: 'static-token'; token: string }
  | { kind: 'session-token'; token: string; nodeId: string; expiresAt: number };

export function authenticateWsUpgrade(request: IncomingMessage): WsUpgradeAuthContext | null {
  const token = extractNodeAuthToken(request, {
    allowQueryTokenAuth: config.wsAllowQueryTokenAuth,
  });

  if (!token) {
    return null;
  }

  if (config.nodeAuthTokens.includes(token)) {
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

