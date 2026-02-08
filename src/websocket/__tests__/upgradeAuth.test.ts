type IncomingMessageLike = {
  url?: string;
  headers: Record<string, string | string[] | undefined>;
};

function loadModuleWithEnv(env: Record<string, string | undefined>) {
  jest.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { authenticateWsUpgrade } = require('../upgradeAuth') as typeof import('../upgradeAuth');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const config = require('../../config').default as typeof import('../../config').default;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { mintWsSessionToken } = require('../sessionTokens') as typeof import('../sessionTokens');
  return { authenticateWsUpgrade, config, mintWsSessionToken };
}

describe('authenticateWsUpgrade', () => {
  it('accepts static bearer tokens via Authorization header', () => {
    const { authenticateWsUpgrade } = loadModuleWithEnv({});

    const request: IncomingMessageLike = {
      headers: { authorization: 'Bearer test-token' },
      url: '/ws/node',
    };

    expect(authenticateWsUpgrade(request as any)).toEqual({ kind: 'static-token', token: 'test-token' });
  });

  it('accepts session tokens via Authorization header', () => {
    const { authenticateWsUpgrade, config, mintWsSessionToken } = loadModuleWithEnv({});

    const minted = mintWsSessionToken('node-1', {
      issuer: config.wsSessionTokenIssuer,
      audience: config.wsSessionTokenAudience,
      ttlSeconds: config.wsSessionTokenTtlSeconds,
      secrets: config.wsSessionTokenSecrets,
    });

    const request: IncomingMessageLike = {
      headers: { authorization: `Bearer ${minted.token}` },
      url: '/ws/node',
    };

    const result = authenticateWsUpgrade(request as any);
    expect(result?.kind).toBe('session-token');
    expect((result as any).nodeId).toBe('node-1');
  });

  it('rejects invalid session tokens', () => {
    const { authenticateWsUpgrade } = loadModuleWithEnv({});

    const request: IncomingMessageLike = {
      headers: { authorization: 'Bearer not-a-token' },
      url: '/ws/node',
    };

    expect(authenticateWsUpgrade(request as any)).toBeNull();
  });

  it('rejects expired session tokens', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-07T00:00:00Z'));

    const { authenticateWsUpgrade, config, mintWsSessionToken } = loadModuleWithEnv({
      WS_SESSION_TOKEN_TTL_SECONDS: '1',
    });

    const minted = mintWsSessionToken('node-1', {
      issuer: config.wsSessionTokenIssuer,
      audience: config.wsSessionTokenAudience,
      ttlSeconds: 1,
      secrets: config.wsSessionTokenSecrets,
    });

    jest.setSystemTime(new Date('2026-02-07T00:00:02Z'));

    const request: IncomingMessageLike = {
      headers: { authorization: `Bearer ${minted.token}` },
      url: '/ws/node',
    };

    expect(authenticateWsUpgrade(request as any)).toBeNull();

    jest.useRealTimers();
  });

  it('gates query-token auth behind WS_ALLOW_QUERY_TOKEN_AUTH', () => {
    const request: IncomingMessageLike = {
      headers: {},
      url: '/ws/node?token=test-token',
    };

    const disallowed = loadModuleWithEnv({ WS_ALLOW_QUERY_TOKEN_AUTH: 'false' });
    expect(disallowed.authenticateWsUpgrade(request as any)).toBeNull();

    const allowed = loadModuleWithEnv({ WS_ALLOW_QUERY_TOKEN_AUTH: 'true' });
    expect(allowed.authenticateWsUpgrade(request as any)).toEqual({ kind: 'static-token', token: 'test-token' });
  });
});

