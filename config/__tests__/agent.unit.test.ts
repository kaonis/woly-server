describe('agent config', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('defaults to standalone mode and does not throw validation', async () => {
    delete process.env.NODE_MODE;
    delete process.env.CNC_URL;
    delete process.env.NODE_ID;
    delete process.env.NODE_LOCATION;
    delete process.env.NODE_AUTH_TOKEN;

    const { agentConfig, validateAgentConfig } = await import('../agent');

    expect(agentConfig.mode).toBe('standalone');
    expect(() => validateAgentConfig()).not.toThrow();
  });

  it('throws when agent mode is enabled with missing required vars', async () => {
    process.env.NODE_MODE = 'agent';
    delete process.env.CNC_URL;
    delete process.env.NODE_ID;
    delete process.env.NODE_LOCATION;
    delete process.env.NODE_AUTH_TOKEN;

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
});
