import { mintWsSessionToken, verifyWsSessionToken } from '../sessionTokens';

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
});
