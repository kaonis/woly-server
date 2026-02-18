const BASE_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  DB_TYPE: 'sqlite',
  DATABASE_URL: ':memory:',
  NODE_AUTH_TOKENS: 'node-token-1,node-token-2',
  OPERATOR_TOKENS: 'operator-token-1',
  JWT_SECRET: 'jwt-secret',
  LOG_LEVEL: 'error',
  NODE_HEARTBEAT_INTERVAL: '30000',
  NODE_TIMEOUT: '90000',
  JWT_TTL_SECONDS: '3600',
  WS_SESSION_TOKEN_TTL_SECONDS: '300',
  WS_MESSAGE_RATE_LIMIT_PER_SECOND: '100',
  WS_MAX_CONNECTIONS_PER_IP: '10',
};

const ORIGINAL_ENV = { ...process.env };

async function loadConfig(overrides: Record<string, string | undefined> = {}) {
  jest.resetModules();
  process.env = {
    ...ORIGINAL_ENV,
    ...BASE_ENV,
  };

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }

  const configModule = await import('../index');
  return configModule.default;
}

describe('config parsing and validation', () => {
  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('parses list and boolean environment variables correctly', async () => {
    const config = await loadConfig({
      OPERATOR_TOKENS: undefined,
      ADMIN_TOKENS: 'admin-1, admin-2,',
      CORS_ORIGINS: 'https://a.example, https://b.example ,',
      WS_REQUIRE_TLS: 'YES',
      WS_ALLOW_QUERY_TOKEN_AUTH: 'off',
      SCHEDULE_WORKER_ENABLED: 'false',
      SCHEDULE_POLL_INTERVAL_MS: '45000',
      SCHEDULE_BATCH_SIZE: '10',
      CNC_PLUGINS: 'webhook, custom-plugin,',
      WEBHOOK_RETRY_BASE_DELAY_MS: '2000',
      WEBHOOK_DELIVERY_TIMEOUT_MS: '8000',
      OFFLINE_COMMAND_TTL_MS: '120000',
    });

    expect(config.operatorAuthTokens).toEqual(['node-token-1', 'node-token-2']);
    expect(config.adminAuthTokens).toEqual(['admin-1', 'admin-2']);
    expect(config.corsOrigins).toEqual(['https://a.example', 'https://b.example']);
    expect(config.wsRequireTls).toBe(true);
    expect(config.wsAllowQueryTokenAuth).toBe(false);
    expect(config.trustProxy).toBe(false);
    expect(config.scheduleWorkerEnabled).toBe(false);
    expect(config.schedulePollIntervalMs).toBe(45000);
    expect(config.scheduleBatchSize).toBe(10);
    expect(config.enabledPlugins).toEqual(['webhook', 'custom-plugin']);
    expect(config.webhookRetryBaseDelayMs).toBe(2000);
    expect(config.webhookDeliveryTimeoutMs).toBe(8000);
    expect(config.offlineCommandTtlMs).toBe(120000);
  });

  it('parses TRUST_PROXY numeric hop count', async () => {
    const config = await loadConfig({
      TRUST_PROXY: '1',
    });

    expect(config.trustProxy).toBe(1);
  });

  it('parses TRUST_PROXY named subnet values', async () => {
    const config = await loadConfig({
      TRUST_PROXY: 'loopback, linklocal, uniquelocal',
    });

    expect(config.trustProxy).toBe('loopback, linklocal, uniquelocal');
  });

  it('throws when NODE_TIMEOUT is less than 2x NODE_HEARTBEAT_INTERVAL', async () => {
    await expect(
      loadConfig({
        NODE_HEARTBEAT_INTERVAL: '5000',
        NODE_TIMEOUT: '9000',
      })
    ).rejects.toThrow('NODE_TIMEOUT must be at least 2x NODE_HEARTBEAT_INTERVAL');
  });

  it('throws when NODE_AUTH_TOKENS resolves to an empty list', async () => {
    await expect(
      loadConfig({
        NODE_AUTH_TOKENS: ' , ',
      })
    ).rejects.toThrow('At least one NODE_AUTH_TOKEN must be configured');
  });

  it('throws when OPERATOR_TOKENS is provided but contains no values', async () => {
    await expect(
      loadConfig({
        NODE_AUTH_TOKENS: 'node-token-1',
        OPERATOR_TOKENS: ' , ',
      })
    ).rejects.toThrow('At least one OPERATOR_TOKENS entry must be configured');
  });

  it('throws when WS_SESSION_TOKEN_TTL_SECONDS is not greater than zero', async () => {
    await expect(
      loadConfig({
        WS_SESSION_TOKEN_TTL_SECONDS: '0',
      })
    ).rejects.toThrow('WS_SESSION_TOKEN_TTL_SECONDS must be a finite number > 0');
  });

  it('throws on invalid numeric environment variables', async () => {
    await expect(
      loadConfig({
        PORT: 'abc',
      })
    ).rejects.toThrow('Invalid numeric environment variable: PORT');
  });

  it('throws when schedule poll interval is not greater than zero', async () => {
    await expect(
      loadConfig({
        SCHEDULE_POLL_INTERVAL_MS: '0',
      }),
    ).rejects.toThrow('SCHEDULE_POLL_INTERVAL_MS must be a finite number > 0');
  });

  it('throws when offline command ttl is not greater than zero', async () => {
    await expect(
      loadConfig({
        OFFLINE_COMMAND_TTL_MS: '0',
      }),
    ).rejects.toThrow('OFFLINE_COMMAND_TTL_MS must be a finite number > 0');
  });

  it('throws when host status history retention is negative', async () => {
    await expect(
      loadConfig({
        HOST_STATUS_HISTORY_RETENTION_DAYS: '-1',
      }),
    ).rejects.toThrow('HOST_STATUS_HISTORY_RETENTION_DAYS must be a finite number >= 0');
  });

  it('throws when webhook retry base delay is not greater than zero', async () => {
    await expect(
      loadConfig({
        WEBHOOK_RETRY_BASE_DELAY_MS: '0',
      }),
    ).rejects.toThrow('WEBHOOK_RETRY_BASE_DELAY_MS must be a finite number > 0');
  });

  it('throws when webhook delivery timeout is not greater than zero', async () => {
    await expect(
      loadConfig({
        WEBHOOK_DELIVERY_TIMEOUT_MS: '0',
      }),
    ).rejects.toThrow('WEBHOOK_DELIVERY_TIMEOUT_MS must be a finite number > 0');
  });
});
