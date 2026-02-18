import { IncomingMessage } from 'http';
import type { AuthContext } from '../types/auth';
import { verifyJwtToken } from '../middleware/auth';
import {
  extractAuthTokenFromAuthorizationHeader,
  extractAuthTokenFromQuery,
  extractAuthTokenFromSubprotocol,
} from './auth';

function hasStreamRole(auth: AuthContext): boolean {
  return auth.roles.includes('operator') || auth.roles.includes('admin');
}

/**
 * Authenticate mobile websocket upgrades.
 *
 * Supports Authorization header/subprotocol and `access_token` query fallback
 * to work in runtimes that cannot set websocket headers.
 */
export function authenticateMobileWsUpgrade(
  request: IncomingMessage
): AuthContext | null {
  const token =
    extractAuthTokenFromAuthorizationHeader(request) ||
    extractAuthTokenFromSubprotocol(request) ||
    extractAuthTokenFromQuery(request, ['access_token', 'token']);

  if (!token) {
    return null;
  }

  try {
    const auth = verifyJwtToken(token);
    return hasStreamRole(auth) ? auth : null;
  } catch {
    return null;
  }
}

export default authenticateMobileWsUpgrade;
