import { createHmac } from 'crypto';
import type { Request, Response } from 'express';

jest.mock('../../config', () => ({
  __esModule: true,
  default: {
    jwtSecret: 'test-secret',
    jwtIssuer: 'test-issuer',
    jwtAudience: 'test-audience',
    jwtTtlSeconds: 60,
    operatorAuthTokens: ['operator-token'],
    adminAuthTokens: ['admin-token'],
  },
}));

import { AuthController } from '../auth';

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function decodeBase64UrlJson(encoded: string): any {
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as any;
}

function verifyHs256(token: string, secret: string): any {
  const parts = token.split('.');
  expect(parts).toHaveLength(3);
  const [h, p, s] = parts;
  const signingInput = `${h}.${p}`;
  const expected = createHmac('sha256', secret).update(signingInput).digest('base64url');
  expect(s).toBe(expected);
  return {
    header: decodeBase64UrlJson(h),
    payload: decodeBase64UrlJson(p),
  };
}

describe('AuthController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when Authorization header is missing', () => {
    const controller = new AuthController();
    const req = { headers: {} } as Request;
    const res = createMockResponse();

    controller.issueToken(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'AUTH_UNAUTHORIZED',
        message: 'Missing Authorization header',
      })
    );
  });

  it('returns 401 when Authorization header is malformed', () => {
    const controller = new AuthController();
    const req = { headers: { authorization: 'InvalidFormat' } } as Request;
    const res = createMockResponse();

    controller.issueToken(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'AUTH_UNAUTHORIZED',
        message: 'Invalid Authorization header format',
      })
    );
  });

  it('returns 401 when authorization token is invalid', () => {
    const controller = new AuthController();
    const req = { headers: { authorization: 'Bearer nope' } } as Request;
    const res = createMockResponse();

    controller.issueToken(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'AUTH_UNAUTHORIZED' }));
  });

  it('mints operator JWT for valid operator token', () => {
    const controller = new AuthController();
    const req = {
      headers: { authorization: 'Bearer operator-token' },
      body: { sub: 'mobile-dev' },
    } as unknown as Request;
    const res = createMockResponse();

    controller.issueToken(req, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();

    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(typeof payload.token).toBe('string');
    expect(typeof payload.expiresAt).toBe('string');

    const decoded = verifyHs256(payload.token, 'test-secret');
    expect(decoded.header).toEqual(expect.objectContaining({ alg: 'HS256', typ: 'JWT' }));
    expect(decoded.payload).toEqual(
      expect.objectContaining({
        iss: 'test-issuer',
        aud: 'test-audience',
        sub: 'mobile-dev',
        role: 'operator',
      })
    );
    expect(decoded.payload.exp).toBeGreaterThan(decoded.payload.iat);
  });

  it('mints admin JWT when role=admin and admin token is provided', () => {
    const controller = new AuthController();
    const req = {
      headers: { authorization: 'Bearer admin-token' },
      body: { role: 'admin', sub: 'mobile-admin' },
    } as unknown as Request;
    const res = createMockResponse();

    controller.issueToken(req, res);

    const payload = (res.json as jest.Mock).mock.calls[0][0];
    const decoded = verifyHs256(payload.token, 'test-secret');
    expect(decoded.payload.role).toBe('admin');
    expect(decoded.payload.sub).toBe('mobile-admin');
  });

  it('returns 401 when role=admin is requested but admin token is not provided', () => {
    const controller = new AuthController();
    const req = {
      headers: { authorization: 'Bearer operator-token' },
      body: { role: 'admin' },
    } as unknown as Request;
    const res = createMockResponse();

    controller.issueToken(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'AUTH_UNAUTHORIZED',
        message: 'Invalid authorization token',
      })
    );
  });
});

describe('AuthController - Privilege Escalation Prevention', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects admin role when ADMIN_TOKENS is empty', async () => {
    // Mock config with no admin tokens
    jest.resetModules();
    jest.doMock('../../config', () => ({
      __esModule: true,
      default: {
        jwtSecret: 'test-secret',
        jwtIssuer: 'test-issuer',
        jwtAudience: 'test-audience',
        jwtTtlSeconds: 60,
        operatorAuthTokens: ['operator-token'],
        adminAuthTokens: [], // Empty admin tokens
      },
    }));

    const { AuthController: TestController } = await import('../auth');
    const controller = new TestController();

    const req = {
      headers: { authorization: 'Bearer operator-token' },
      body: { role: 'admin' },
    } as unknown as Request;
    const res = createMockResponse();

    controller.issueToken(req, res);

    // Should return generic error to avoid leaking that admin role is not configured
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'AUTH_UNAUTHORIZED',
        message: 'Invalid authorization token',
      })
    );
  });
});

