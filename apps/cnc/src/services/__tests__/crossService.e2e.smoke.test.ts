import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import Database from 'better-sqlite3';

jest.setTimeout(180_000);

const LOCALHOST = '127.0.0.1';
const WORKSPACE_ROOT = resolve(__dirname, '../../../../..');
const TS_NODE_BIN = resolve(WORKSPACE_ROOT, 'node_modules', 'ts-node', 'dist', 'bin.js');

const SMOKE_NODE_ID = 'smoke-node-e2e';
const SMOKE_LOCATION = 'smoke-lab';
const SMOKE_HOST_NAME = 'SMOKE-DESKTOP';
const SMOKE_HOST_FQN = `${SMOKE_HOST_NAME}@${encodeURIComponent(SMOKE_LOCATION)}-${SMOKE_NODE_ID}`;

type RunningService = {
  name: string;
  process: ChildProcess;
  logs: string[];
  stop: () => Promise<void>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function formatServiceLogs(services: RunningService[]): string {
  const lines = services.flatMap((service) => service.logs);
  if (lines.length === 0) {
    return 'No captured service logs.';
  }

  return lines.join('\n');
}

async function getFreePort(): Promise<number> {
  return new Promise<number>((resolvePort, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, LOCALHOST, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to allocate an ephemeral port'));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolvePort(port);
      });
    });
  });
}

function startService(params: {
  name: string;
  cwd: string;
  entry: string;
  env: NodeJS.ProcessEnv;
}): RunningService {
  const logs: string[] = [];
  const child = spawn(process.execPath, [TS_NODE_BIN, params.entry], {
    cwd: params.cwd,
    env: {
      ...process.env,
      ...params.env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const capture = (source: 'stdout' | 'stderr', chunk: Buffer): void => {
    const text = chunk.toString('utf8');
    const lines = text
      .split(/\r?\n/g)
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);

    for (const line of lines) {
      logs.push(`[${params.name}:${source}] ${line}`);
      if (logs.length > 300) {
        logs.shift();
      }
    }
  };

  child.stdout?.on('data', (chunk: Buffer) => capture('stdout', chunk));
  child.stderr?.on('data', (chunk: Buffer) => capture('stderr', chunk));

  const stop = async (): Promise<void> => {
    if (child.exitCode !== null) {
      return;
    }

    child.kill('SIGTERM');
    const exited = await Promise.race([once(child, 'exit').then(() => true), sleep(5_000).then(() => false)]);
    if (exited) {
      return;
    }

    if (child.exitCode === null) {
      child.kill('SIGKILL');
      await once(child, 'exit');
    }
  };

  return {
    name: params.name,
    process: child,
    logs,
    stop,
  };
}

async function fetchJson(
  url: string,
  init?: RequestInit
): Promise<{ status: number; body: unknown; rawBody: string }> {
  const response = await fetch(url, init);
  const rawBody = await response.text();

  if (rawBody.trim().length === 0) {
    return { status: response.status, body: null, rawBody };
  }

  try {
    return {
      status: response.status,
      body: JSON.parse(rawBody) as unknown,
      rawBody,
    };
  } catch {
    return { status: response.status, body: rawBody, rawBody };
  }
}

async function waitForCondition(params: {
  description: string;
  timeoutMs: number;
  check: () => Promise<boolean>;
}): Promise<void> {
  const startedAt = Date.now();
  let lastError: string | null = null;

  while (Date.now() - startedAt < params.timeoutMs) {
    try {
      if (await params.check()) {
        return;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await sleep(250);
  }

  if (lastError) {
    throw new Error(`${params.description} timed out (${lastError})`);
  }

  throw new Error(`${params.description} timed out`);
}

function seedNodeAgentDatabase(dbPath: string): void {
  const db = new Database(dbPath);
  db.exec(`CREATE TABLE IF NOT EXISTS hosts(
    name text PRIMARY KEY UNIQUE,
    mac text NOT NULL UNIQUE,
    ip text NOT NULL UNIQUE,
    status text NOT NULL,
    lastSeen datetime,
    discovered integer DEFAULT 0,
    pingResponsive integer,
    notes text,
    tags text NOT NULL DEFAULT '[]'
  )`);

  db.prepare(
    `INSERT INTO hosts (name, mac, ip, status, lastSeen, discovered, pingResponsive, notes, tags)
     VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?, ?)`
  ).run(
    SMOKE_HOST_NAME,
    'AA:BB:CC:DD:EE:11',
    '192.168.10.42',
    'awake',
    1,
    1,
    'seeded by cross-service smoke',
    JSON.stringify(['smoke'])
  );

  db.close();
}

async function issueOperatorJwt(params: {
  cncPort: number;
  operatorToken: string;
}): Promise<string> {
  const response = await fetchJson(`http://${LOCALHOST}:${params.cncPort}/api/auth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.operatorToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      role: 'operator',
      sub: 'cross-service-smoke',
    }),
  });

  if (response.status !== 200 || !isRecord(response.body) || typeof response.body.token !== 'string') {
    throw new Error(
      `Failed to issue operator JWT (status=${response.status}, body=${response.rawBody || '<empty>'})`
    );
  }

  return response.body.token;
}

describe('Cross-service E2E smoke', () => {
  let services: RunningService[] = [];
  let tempDir: string | null = null;

  afterEach(async () => {
    for (const service of services.reverse()) {
      await service.stop();
    }
    services = [];

    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it('registers node, propagates host inventory, and routes wake command', async () => {
    try {
      const cncPort = await getFreePort();
      const nodeAgentPort = await getFreePort();

      tempDir = mkdtempSync(join(tmpdir(), 'woly-cross-service-smoke-'));
      const cncDbPath = join(tempDir, 'cnc-smoke.sqlite');
      const nodeDbPath = join(tempDir, 'node-agent-smoke.sqlite');

      seedNodeAgentDatabase(nodeDbPath);

      const wsNodeAuthToken = 'smoke-node-token';
      const operatorToken = 'smoke-operator-token';

      const cncService = startService({
        name: 'cnc',
        cwd: resolve(WORKSPACE_ROOT, 'apps/cnc'),
        entry: 'src/server.ts',
        env: {
          NODE_ENV: 'test',
          PORT: String(cncPort),
          DB_TYPE: 'sqlite',
          DATABASE_URL: cncDbPath,
          NODE_AUTH_TOKENS: wsNodeAuthToken,
          OPERATOR_TOKENS: operatorToken,
          ADMIN_TOKENS: 'smoke-admin-token',
          JWT_SECRET: 'smoke-jwt-secret',
          JWT_ISSUER: 'smoke-issuer',
          JWT_AUDIENCE: 'smoke-audience',
          WS_REQUIRE_TLS: 'false',
          WS_ALLOW_QUERY_TOKEN_AUTH: 'true',
          NODE_HEARTBEAT_INTERVAL: '1000',
          NODE_TIMEOUT: '3000',
          COMMAND_TIMEOUT: '7000',
          LOG_LEVEL: 'error',
        },
      });
      services.push(cncService);

      await waitForCondition({
        description: 'C&C /health',
        timeoutMs: 30_000,
        check: async () => {
          const response = await fetchJson(`http://${LOCALHOST}:${cncPort}/health`);
          return response.status === 200;
        },
      });

      const operatorJwt = await issueOperatorJwt({ cncPort, operatorToken });
      const cncAuthHeaders = {
        Authorization: `Bearer ${operatorJwt}`,
      };

      const nodeAgentService = startService({
        name: 'node-agent',
        cwd: resolve(WORKSPACE_ROOT, 'apps/node-agent'),
        entry: 'src/app.ts',
        env: {
          NODE_ENV: 'test',
          NODE_MODE: 'agent',
          PORT: String(nodeAgentPort),
          HOST: LOCALHOST,
          DB_PATH: nodeDbPath,
          CNC_URL: `ws://${LOCALHOST}:${cncPort}`,
          NODE_ID: SMOKE_NODE_ID,
          NODE_LOCATION: SMOKE_LOCATION,
          NODE_AUTH_TOKEN: wsNodeAuthToken,
          SCAN_INTERVAL: '3600000',
          SCAN_DELAY: '3600000',
          LOG_LEVEL: 'error',
        },
      });
      services.push(nodeAgentService);

      await waitForCondition({
        description: 'node-agent /health agent.connected',
        timeoutMs: 30_000,
        check: async () => {
          const response = await fetchJson(`http://${LOCALHOST}:${nodeAgentPort}/health`);
          if (response.status !== 200 || !isRecord(response.body)) {
            return false;
          }

          const maybeAgent = response.body.agent;
          if (!isRecord(maybeAgent)) {
            return false;
          }

          return maybeAgent.connected === true;
        },
      });

      await waitForCondition({
        description: 'C&C node registration',
        timeoutMs: 30_000,
        check: async () => {
          const response = await fetchJson(`http://${LOCALHOST}:${cncPort}/api/nodes`, {
            headers: cncAuthHeaders,
          });

          if (response.status !== 200 || !isRecord(response.body)) {
            return false;
          }

          const { nodes } = response.body;
          if (!Array.isArray(nodes)) {
            return false;
          }

          return nodes.some(
            (node) => isRecord(node) && node.id === SMOKE_NODE_ID && node.connected === true
          );
        },
      });

      await waitForCondition({
        description: 'C&C host propagation',
        timeoutMs: 30_000,
        check: async () => {
          const response = await fetchJson(`http://${LOCALHOST}:${cncPort}/api/hosts`, {
            headers: cncAuthHeaders,
          });

          if (response.status !== 200 || !isRecord(response.body)) {
            return false;
          }

          const { hosts } = response.body;
          if (!Array.isArray(hosts)) {
            return false;
          }

          return hosts.some(
            (host) =>
              isRecord(host) &&
              host.fullyQualifiedName === SMOKE_HOST_FQN &&
              host.nodeId === SMOKE_NODE_ID
          );
        },
      });

      const wakeupResponse = await fetchJson(
        `http://${LOCALHOST}:${cncPort}/api/hosts/wakeup/${encodeURIComponent(SMOKE_HOST_FQN)}`,
        {
          method: 'POST',
          headers: {
            ...cncAuthHeaders,
            'Idempotency-Key': 'cross-service-smoke-wakeup',
          },
        }
      );

      // Wake packet send may fail in restricted test environments, but command routing
      // should still complete and return a terminal response (non-timeout).
      expect([200, 500]).toContain(wakeupResponse.status);
      expect(wakeupResponse.status).not.toBe(504);

      if (!isRecord(wakeupResponse.body)) {
        throw new Error(`Wake response body was not JSON object: ${wakeupResponse.rawBody}`);
      }

      expect(typeof wakeupResponse.body.correlationId).toBe('string');

      if (wakeupResponse.status === 200) {
        expect(wakeupResponse.body.success).toBe(true);
        expect(wakeupResponse.body.nodeId).toBe(SMOKE_NODE_ID);
      } else {
        expect(wakeupResponse.body.error).toBe('Internal Server Error');
        expect(typeof wakeupResponse.body.message).toBe('string');
      }
    } catch (error) {
      const baseMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`${baseMessage}\n\nCaptured service logs:\n${formatServiceLogs(services)}`);
    }
  });
});
