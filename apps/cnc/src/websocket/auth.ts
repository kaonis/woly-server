import { IncomingMessage } from 'http';
import { parse } from 'url';

export interface WebSocketAuthOptions {
  allowQueryTokenAuth: boolean;
}

function firstHeaderValue(value: string | string[] | undefined): string | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] : value;
}

export function extractAuthTokenFromAuthorizationHeader(request: IncomingMessage): string | null {
  const value = firstHeaderValue(request.headers.authorization);
  if (!value) {
    return null;
  }

  const [scheme, token] = value.trim().split(/\s+/, 2);
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
    return null;
  }

  return token;
}

export function extractAuthTokenFromSubprotocol(request: IncomingMessage): string | null {
  const protocolHeader = firstHeaderValue(request.headers['sec-websocket-protocol']);
  if (!protocolHeader) {
    return null;
  }

  const protocols = protocolHeader
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  for (let i = 0; i < protocols.length; i++) {
    const current = protocols[i];
    if (current.toLowerCase() === 'bearer') {
      return protocols[i + 1] || null;
    }

    if (current.toLowerCase().startsWith('bearer.')) {
      return current.slice('bearer.'.length) || null;
    }
  }

  return null;
}

export function extractAuthTokenFromQuery(request: IncomingMessage): string | null {
  const { query } = parse(request.url || '', true);
  const token = query.token;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

export function extractNodeAuthToken(
  request: IncomingMessage,
  options: WebSocketAuthOptions
): string | null {
  return (
    extractAuthTokenFromAuthorizationHeader(request) ||
    extractAuthTokenFromSubprotocol(request) ||
    (options.allowQueryTokenAuth ? extractAuthTokenFromQuery(request) : null)
  );
}

export function isRequestTls(request: IncomingMessage): boolean {
  if ((request.socket as IncomingMessage['socket'] & { encrypted?: boolean }).encrypted) {
    return true;
  }

  const forwardedProto = firstHeaderValue(request.headers['x-forwarded-proto']);
  if (forwardedProto && forwardedProto.toLowerCase() === 'https') {
    return true;
  }

  return false;
}
