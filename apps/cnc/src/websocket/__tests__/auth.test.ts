import { IncomingMessage } from 'http';
import {
  extractAuthTokenFromAuthorizationHeader,
  extractAuthTokenFromQuery,
  extractAuthTokenFromSubprotocol,
  extractNodeAuthToken,
  isRequestTls,
} from '../auth';

function buildRequest(
  overrides: Partial<IncomingMessage> & {
    headers?: Record<string, string | string[] | undefined>;
    url?: string;
    encrypted?: boolean;
  } = {}
): IncomingMessage {
  return {
    url: overrides.url || '/ws/node',
    headers: overrides.headers || {},
    socket: ({ encrypted: overrides.encrypted ?? false } as unknown) as IncomingMessage['socket'],
  } as IncomingMessage;
}

describe('websocket auth helpers', () => {
  it('extracts bearer token from Authorization header', () => {
    const request = buildRequest({
      headers: { authorization: 'Bearer token-abc' },
    });

    expect(extractAuthTokenFromAuthorizationHeader(request)).toBe('token-abc');
  });

  it('extracts token from subprotocol bearer,<token>', () => {
    const request = buildRequest({
      headers: { 'sec-websocket-protocol': 'json, bearer, token-xyz' },
    });

    expect(extractAuthTokenFromSubprotocol(request)).toBe('token-xyz');
  });

  it('extracts token from subprotocol bearer.<token>', () => {
    const request = buildRequest({
      headers: { 'sec-websocket-protocol': 'bearer.token-xyz' },
    });

    expect(extractAuthTokenFromSubprotocol(request)).toBe('token-xyz');
  });

  it('falls back to query token only when enabled', () => {
    const request = buildRequest({
      url: '/ws/node?token=query-token',
    });

    expect(extractNodeAuthToken(request, { allowQueryTokenAuth: true })).toBe('query-token');
    expect(extractNodeAuthToken(request, { allowQueryTokenAuth: false })).toBeNull();
  });

  it('prefers authorization header over query token', () => {
    const request = buildRequest({
      url: '/ws/node?token=query-token',
      headers: { authorization: 'Bearer header-token' },
    });

    expect(extractNodeAuthToken(request, { allowQueryTokenAuth: true })).toBe('header-token');
  });

  it('supports custom query token parameter names', () => {
    const request = buildRequest({
      url: '/ws/mobile/hosts?access_token=query-token',
    });

    expect(extractAuthTokenFromQuery(request, ['access_token', 'token'])).toBe('query-token');
    expect(extractAuthTokenFromQuery(request, ['token'])).toBeNull();
  });

  it('detects TLS via socket encryption', () => {
    const request = buildRequest({ encrypted: true });
    expect(isRequestTls(request)).toBe(true);
  });

  it('detects TLS via x-forwarded-proto', () => {
    const request = buildRequest({
      headers: { 'x-forwarded-proto': 'https' },
    });
    expect(isRequestTls(request)).toBe(true);
  });

  it('returns false for non-TLS request', () => {
    const request = buildRequest({
      headers: { 'x-forwarded-proto': 'http' },
      encrypted: false,
    });
    expect(isRequestTls(request)).toBe(false);
  });
});
