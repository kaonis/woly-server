import { createHmac } from 'crypto';
import { NextFunction, Request, Response } from 'express';

jest.mock('../../config', () => ({
  __esModule: true,
  default: {
    jwtSecret: 'test-secret',
    jwtIssuer: 'test-issuer',
    jwtAudience: 'test-audience',
  },
}));

import { authenticateJwt, authorizeRoles } from '../auth';

function encodeBase64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createToken(payload: Record<string, unknown>, secret = 'test-secret'): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = encodeBase64Url(header);
  const encodedPayload = encodeBase64Url(payload);
  const signature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('Auth middleware', () => {
  const now = Math.floor(Date.now() / 1000);
  const next = jest.fn() as NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('authenticateJwt', () => {
    it('returns 401 when authorization header is missing', () => {
      const req = { headers: {} } as Request;
      const res = createMockResponse();

      authenticateJwt(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'AUTH_UNAUTHORIZED' }));
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 for malformed authorization header', () => {
      const req = { headers: { authorization: 'Basic abc' } } as Request;
      const res = createMockResponse();

      authenticateJwt(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 for invalid signature', () => {
      const token = createToken(
        {
          sub: 'user-1',
          role: 'operator',
          iss: 'test-issuer',
          aud: 'test-audience',
          exp: now + 3600,
        },
        'wrong-secret'
      );
      const req = { headers: { authorization: `Bearer ${token}` } } as Request;
      const res = createMockResponse();

      authenticateJwt(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 for expired token', () => {
      const token = createToken({
        sub: 'user-1',
        role: 'operator',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now - 1,
      });
      const req = { headers: { authorization: `Bearer ${token}` } } as Request;
      const res = createMockResponse();

      authenticateJwt(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('attaches auth context for valid token', () => {
      const token = createToken({
        sub: 'user-1',
        role: 'operator',
        roles: ['operator', 'admin'],
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now + 3600,
      });
      const req = { headers: { authorization: `Bearer ${token}` } } as Request;
      const res = createMockResponse();

      authenticateJwt(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.auth).toEqual(
        expect.objectContaining({
          sub: 'user-1',
          roles: expect.arrayContaining(['operator', 'admin']),
        })
      );
    });
  });

  describe('authorizeRoles', () => {
    it('returns 403 when role is missing', () => {
      const req = {
        auth: {
          sub: 'user-1',
          roles: ['operator'],
          claims: {},
        },
      } as Request;
      const res = createMockResponse();

      authorizeRoles('admin')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'AUTH_FORBIDDEN' }));
      expect(next).not.toHaveBeenCalled();
    });

    it('allows request when required role exists', () => {
      const req = {
        auth: {
          sub: 'user-1',
          roles: ['admin'],
          claims: {},
        },
      } as Request;
      const res = createMockResponse();

      authorizeRoles('admin')(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
