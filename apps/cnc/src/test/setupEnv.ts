const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  DB_TYPE: 'sqlite',
  DATABASE_URL: ':memory:',
  NODE_AUTH_TOKENS: 'test-token,dev-token-home',
  JWT_SECRET: 'test-secret',
  JWT_ISSUER: 'test-issuer',
  JWT_AUDIENCE: 'test-audience',
  NODE_HEARTBEAT_INTERVAL: '30000',
  NODE_TIMEOUT: '90000',
  LOG_LEVEL: 'error',
};

for (const [key, value] of Object.entries(defaults)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}
