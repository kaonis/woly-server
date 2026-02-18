import type { IncomingMessage } from 'http';
import { verifyJwtToken } from '../../middleware/auth';
import { authenticateMobileWsUpgrade } from '../mobileUpgradeAuth';

jest.mock('../../middleware/auth', () => ({
  verifyJwtToken: jest.fn(),
}));

function buildRequest(
  overrides: Partial<IncomingMessage> & {
    headers?: Record<string, string | string[] | undefined>;
    url?: string;
  } = {}
): IncomingMessage {
  return {
    url: overrides.url || '/ws/mobile/hosts',
    headers: overrides.headers || {},
    socket: {} as IncomingMessage['socket'],
  } as IncomingMessage;
}

describe('authenticateMobileWsUpgrade', () => {
  const mockVerifyJwtToken = verifyJwtToken as jest.MockedFunction<typeof verifyJwtToken>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when no auth token is provided', () => {
    const request = buildRequest({
      headers: {},
    });

    expect(authenticateMobileWsUpgrade(request)).toBeNull();
    expect(mockVerifyJwtToken).not.toHaveBeenCalled();
  });

  it('accepts bearer tokens from Authorization header for operator role', () => {
    mockVerifyJwtToken.mockReturnValue({
      sub: 'operator-1',
      roles: ['operator'],
      claims: {},
    });
    const request = buildRequest({
      headers: { authorization: 'Bearer mobile-token' },
    });

    const auth = authenticateMobileWsUpgrade(request);
    expect(mockVerifyJwtToken).toHaveBeenCalledWith('mobile-token');
    expect(auth).toMatchObject({ sub: 'operator-1', roles: ['operator'] });
  });

  it('accepts bearer token from websocket subprotocol for admin role', () => {
    mockVerifyJwtToken.mockReturnValue({
      sub: 'admin-1',
      roles: ['admin'],
      claims: {},
    });
    const request = buildRequest({
      headers: { 'sec-websocket-protocol': 'json, bearer, subprotocol-token' },
    });

    const auth = authenticateMobileWsUpgrade(request);
    expect(mockVerifyJwtToken).toHaveBeenCalledWith('subprotocol-token');
    expect(auth).toMatchObject({ sub: 'admin-1', roles: ['admin'] });
  });

  it('accepts access_token query fallback', () => {
    mockVerifyJwtToken.mockReturnValue({
      sub: 'operator-2',
      roles: ['operator'],
      claims: {},
    });
    const request = buildRequest({
      headers: {},
      url: '/ws/mobile/hosts?access_token=query-token',
    });

    const auth = authenticateMobileWsUpgrade(request);
    expect(mockVerifyJwtToken).toHaveBeenCalledWith('query-token');
    expect(auth).toMatchObject({ sub: 'operator-2' });
  });

  it('accepts token query fallback', () => {
    mockVerifyJwtToken.mockReturnValue({
      sub: 'operator-3',
      roles: ['operator'],
      claims: {},
    });
    const request = buildRequest({
      headers: {},
      url: '/ws/mobile/hosts?token=query-token',
    });

    const auth = authenticateMobileWsUpgrade(request);
    expect(mockVerifyJwtToken).toHaveBeenCalledWith('query-token');
    expect(auth).toMatchObject({ sub: 'operator-3' });
  });

  it('rejects non-stream roles', () => {
    mockVerifyJwtToken.mockReturnValue({
      sub: 'viewer-1',
      roles: ['viewer'],
      claims: {},
    });
    const request = buildRequest({
      headers: { authorization: 'Bearer viewer-token' },
    });

    expect(authenticateMobileWsUpgrade(request)).toBeNull();
  });

  it('returns null when token verification throws', () => {
    mockVerifyJwtToken.mockImplementation(() => {
      throw new Error('invalid token');
    });
    const request = buildRequest({
      headers: { authorization: 'Bearer invalid-token' },
    });

    expect(authenticateMobileWsUpgrade(request)).toBeNull();
  });
});
