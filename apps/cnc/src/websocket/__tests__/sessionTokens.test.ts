import { createHmac } from 'crypto';
import { mintWsSessionToken, verifyWsSessionToken } from '../sessionTokens';

function mutateToken(
  token: string,
  mutate: (input: {
    header: Record<string, unknown>;
    payload: Record<string, unknown>;
  }) => void,
  signingSecret = 'secret-1'
): string {
  const [encodedHeader, encodedPayload] = token.split('.');
  const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;

  mutate({ header, payload });

  const mutatedHeader = Buffer.from(JSON.stringify(header), 'utf8').toString('base64url');
  const mutatedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signingInput = `${mutatedHeader}.${mutatedPayload}`;
  const signature = createHmac('sha256', signingSecret).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

describe('WebSocket session tokens', () => {
  const config = {
    issuer: 'test-issuer',
    audience: 'woly-ws-node',
    ttlSeconds: 60,
    secrets: ['secret-1', 'secret-0'],
  };

  it('creates and verifies a token', () => {
    const { token } = mintWsSessionToken('node-1', config);
    const claims = verifyWsSessionToken(token, config);
    expect(claims.nodeId).toBe('node-1');
    expect(typeof claims.expiresAt).toBe('number');
  });

  it('rejects token with wrong audience', () => {
    const { token } = mintWsSessionToken('node-1', config);
    expect(() => verifyWsSessionToken(token, { ...config, audience: 'wrong' })).toThrow(
      'Invalid session token audience'
    );
  });

  it('rejects token with wrong issuer', () => {
    const { token } = mintWsSessionToken('node-1', config);
    expect(() => verifyWsSessionToken(token, { ...config, issuer: 'wrong' })).toThrow(
      'Invalid session token issuer'
    );
  });

  it('supports secret rotation by verifying against secondary secret', () => {
    const rotatedConfig = { ...config, secrets: ['new-secret', 'secret-1'] };
    const { token } = mintWsSessionToken('node-2', { ...config, secrets: ['secret-1'] });
    const claims = verifyWsSessionToken(token, rotatedConfig);
    expect(claims.nodeId).toBe('node-2');
  });

  it('rejects malformed tokens', () => {
    expect(() => verifyWsSessionToken('not.a.jwt.with.extra', config)).toThrow('Malformed session token');
  });

  it('rejects unsupported token algorithms', () => {
    const { token } = mintWsSessionToken('node-1', config);
    const tampered = mutateToken(token, ({ header }) => {
      header.alg = 'none';
    });

    expect(() => verifyWsSessionToken(tampered, config)).toThrow('Unsupported session token algorithm');
  });

  it('rejects invalid token signatures', () => {
    const { token } = mintWsSessionToken('node-1', config);
    const [encodedHeader, encodedPayload] = token.split('.');
    const tampered = `${encodedHeader}.${encodedPayload}.invalid-signature`;

    expect(() => verifyWsSessionToken(tampered, config)).toThrow('Invalid session token signature');
  });

  it('rejects invalid session token type', () => {
    const { token } = mintWsSessionToken('node-1', config);
    const tampered = mutateToken(token, ({ payload }) => {
      payload.typ = 'unexpected-type';
    });

    expect(() => verifyWsSessionToken(tampered, config)).toThrow('Invalid session token type');
  });

  it('rejects future issued-at claims', () => {
    const now = Math.floor(Date.now() / 1000);
    const { token } = mintWsSessionToken('node-1', config);
    const tampered = mutateToken(token, ({ payload }) => {
      payload.iat = now + 30;
      payload.exp = now + 35;
    });

    expect(() => verifyWsSessionToken(tampered, config)).toThrow(
      'Session token issued-at is in the future'
    );
  });

  it('rejects invalid and excessive token lifetimes', () => {
    const now = Math.floor(Date.now() / 1000);
    const { token } = mintWsSessionToken('node-1', config);
    const invalidLifetime = mutateToken(token, ({ payload }) => {
      payload.iat = now;
      payload.exp = now;
    });
    const excessiveLifetime = mutateToken(token, ({ payload }) => {
      payload.iat = now;
      payload.exp = now + config.ttlSeconds + 10;
    });

    expect(() => verifyWsSessionToken(invalidLifetime, config)).toThrow(
      'Session token lifetime is invalid'
    );
    expect(() => verifyWsSessionToken(excessiveLifetime, config)).toThrow(
      'Session token lifetime exceeds maximum'
    );
  });

  it('rejects expired tokens with otherwise valid lifetimes', () => {
    const now = Math.floor(Date.now() / 1000);
    const { token } = mintWsSessionToken('node-1', config);
    const expired = mutateToken(token, ({ payload }) => {
      payload.iat = now - 10;
      payload.exp = now - 1;
    });

    expect(() => verifyWsSessionToken(expired, config)).toThrow('Session token expired');
  });

  it('validates minting inputs', () => {
    expect(() => mintWsSessionToken('', config)).toThrow('nodeId is required');
    expect(() => mintWsSessionToken('node-1', { ...config, secrets: [] })).toThrow(
      'At least one session token secret is required'
    );
    expect(() => mintWsSessionToken('node-1', { ...config, ttlSeconds: 0 })).toThrow(
      'ttlSeconds must be > 0'
    );
  });
});
