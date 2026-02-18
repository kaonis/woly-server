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
});
