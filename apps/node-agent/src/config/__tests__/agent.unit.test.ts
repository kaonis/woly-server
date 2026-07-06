describe('agent config', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.TUNNEL_MODE;
    delete process.env.CLOUDFLARE_TUNNEL_URL;
    delete process.env.CLOUDFLARE_TUNNEL_TOKEN;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('defaults to standalone mode and does not throw validation', async () => {
    process.env.NODE_MODE = 'standalone';
    delete process.env.CNC_URL;
    delete process.env.NODE_ID;
    delete process.env.NODE_LOCATION;
    process.env.NODE_AUTH_TOKEN = '';

    const { agentConfig, validateAgentConfig } = await import('../agent');

    expect(agentConfig.mode).toBe('standalone');
    expect(() => validateAgentConfig()).not.toThrow();
  });

  it('throws when agent mode is enabled with missing required vars', async () => {
    process.env.NODE_MODE = 'agent';
    process.env.CNC_URL = '';
    process.env.NODE_ID = '';
    process.env.NODE_LOCATION = '';
    process.env.NODE_AUTH_TOKEN = '';

    const { validateAgentConfig } = await import('../agent');

    expect(() => validateAgentConfig()).toThrow(
      'Agent mode enabled but missing required configuration'
    );
  });

  it('passes validation when agent mode has all required vars', async () => {
    process.env.NODE_MODE = 'agent';
    process.env.CNC_URL = 'ws://localhost:8080';
    process.env.NODE_ID = 'node-1';
    process.env.NODE_LOCATION = 'lab';
    process.env.NODE_AUTH_TOKEN = 'secret-token';

    const { agentConfig, validateAgentConfig } = await import('../agent');

    expect(agentConfig.mode).toBe('agent');
    expect(agentConfig.cncUrl).toBe('ws://localhost:8080');
    expect(() => validateAgentConfig()).not.toThrow();
  });

  it('uses Cloudflare tunnel URL as publicUrl when tunnel mode is cloudflare', async () => {
    process.env.NODE_MODE = 'agent';
    process.env.CNC_URL = 'ws://localhost:8080';
    process.env.NODE_ID = 'node-1';
    process.env.NODE_LOCATION = 'lab';
    process.env.NODE_AUTH_TOKEN = 'secret-token';
    process.env.TUNNEL_MODE = 'cloudflare';
    process.env.CLOUDFLARE_TUNNEL_URL = 'https://node-1.example.trycloudflare.com/';
    process.env.CLOUDFLARE_TUNNEL_TOKEN = 'cloudflare-token';

    const { agentConfig, validateAgentConfig } = await import('../agent');

    expect(agentConfig.tunnelMode).toBe('cloudflare');
    expect(agentConfig.publicUrl).toBe('https://node-1.example.trycloudflare.com');
    expect(() => validateAgentConfig()).not.toThrow();
  });

  it('throws when cloudflare tunnel mode is enabled without required tunnel config', async () => {
    process.env.NODE_MODE = 'agent';
    process.env.CNC_URL = 'ws://localhost:8080';
    process.env.NODE_ID = 'node-1';
    process.env.NODE_LOCATION = 'lab';
    process.env.NODE_AUTH_TOKEN = 'secret-token';
    process.env.TUNNEL_MODE = 'cloudflare';
    process.env.CLOUDFLARE_TUNNEL_URL = '';
    process.env.CLOUDFLARE_TUNNEL_TOKEN = '';

    const { validateAgentConfig } = await import('../agent');

    expect(() => validateAgentConfig()).toThrow(
      'Agent mode enabled but missing required configuration'
    );
  });

  it('throws when TUNNEL_MODE is invalid', async () => {
    process.env.NODE_MODE = 'agent';
    process.env.CNC_URL = 'ws://localhost:8080';
    process.env.NODE_ID = 'node-1';
    process.env.NODE_LOCATION = 'lab';
    process.env.NODE_AUTH_TOKEN = 'secret-token';
    process.env.TUNNEL_MODE = 'invalid-mode';

    const { validateAgentConfig } = await import('../agent');

    expect(() => validateAgentConfig()).toThrow(
      'TUNNEL_MODE must be either "direct" or "cloudflare"'
    );
  });

  it('throws when heartbeat interval is non-positive', async () => {
    process.env.HEARTBEAT_INTERVAL = '0';

    const { validateAgentConfig } = await import('../agent');

    expect(() => validateAgentConfig()).toThrow(
      'HEARTBEAT_INTERVAL must be a positive integer'
    );
  });

  it('throws when reconnect attempts is malformed', async () => {
    process.env.MAX_RECONNECT_ATTEMPTS = 'forever';

    const { validateAgentConfig } = await import('../agent');

    expect(() => validateAgentConfig()).toThrow(
      'MAX_RECONNECT_ATTEMPTS must be a non-negative integer'
    );
  });

  it('allows zero host update debounce', async () => {
    process.env.NODE_HOST_UPDATE_DEBOUNCE_MS = '0';

    const { agentConfig, validateAgentConfig } = await import('../agent');

    expect(agentConfig.hostUpdateDebounceMs).toBe(0);
    expect(() => validateAgentConfig()).not.toThrow();
  });

  it('ignores malformed session token timing when session token auth is disabled', async () => {
    process.env.NODE_SESSION_TOKEN_URL = '';
    process.env.NODE_SESSION_TOKEN_TIMEOUT_MS = 'invalid';

    const { validateAgentConfig } = await import('../agent');

    expect(() => validateAgentConfig()).not.toThrow();
  });

  it('throws for malformed session token timing when session token auth is enabled', async () => {
    process.env.NODE_SESSION_TOKEN_URL = 'https://cnc.example.test/session-token';
    process.env.NODE_SESSION_TOKEN_TIMEOUT_MS = 'invalid';

    const { validateAgentConfig } = await import('../agent');

    expect(() => validateAgentConfig()).toThrow(
      'NODE_SESSION_TOKEN_TIMEOUT_MS must be a positive integer'
    );
  });
});
