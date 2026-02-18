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

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
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
    const exited = await Promise.race([
      once(child, 'exit').then(() => true),
      sleep(5_000, false, { ref: false }),
    ]);
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
    wol_port integer NOT NULL DEFAULT 9,
    lastSeen datetime,
    discovered integer DEFAULT 0,
    pingResponsive integer,
    notes text,
    tags text NOT NULL DEFAULT '[]'
  )`);

  db.prepare(
    `INSERT INTO hosts (name, mac, ip, status, wol_port, lastSeen, discovered, pingResponsive, notes, tags)
     VALUES (?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?)`
  ).run(
    SMOKE_HOST_NAME,
    'AA:BB:CC:DD:EE:11',
    '192.168.10.42',
    'awake',
    9,
    1,
    1,
    'seeded by cross-service smoke',
    JSON.stringify(['smoke'])
  );

  db.close();
}

async function issueJwt(params: {
  cncPort: number;
  bearerToken: string;
  role: 'operator' | 'admin';
  sub: string;
}): Promise<string> {
  const response = await fetchJson(`http://${LOCALHOST}:${params.cncPort}/api/auth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.bearerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      role: params.role,
      sub: params.sub,
    }),
  });

  if (response.status !== 200 || !isRecord(response.body) || typeof response.body.token !== 'string') {
    throw new Error(
      `Failed to issue ${params.role} JWT (status=${response.status}, body=${response.rawBody || '<empty>'})`
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

  it('covers registration, propagation, wake, schedule execution, and reconnect queue delivery', async () => {
    try {
      const cncPort = await getFreePort();
      const nodeAgentPort = await getFreePort();

      tempDir = mkdtempSync(join(tmpdir(), 'woly-cross-service-smoke-'));
      const cncDbPath = join(tempDir, 'cnc-smoke.sqlite');
      const nodeDbPath = join(tempDir, 'node-agent-smoke.sqlite');

      seedNodeAgentDatabase(nodeDbPath);

      const wsNodeAuthToken = 'smoke-node-token';
      const operatorToken = 'smoke-operator-token';
      const adminToken = 'smoke-admin';

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
          ADMIN_TOKENS: adminToken,
          JWT_SECRET: 'smoke-jwt-secret',
          JWT_ISSUER: 'smoke-issuer',
          JWT_AUDIENCE: 'smoke-audience',
          WS_REQUIRE_TLS: 'false',
          WS_ALLOW_QUERY_TOKEN_AUTH: 'true',
          NODE_HEARTBEAT_INTERVAL: '1000',
          NODE_TIMEOUT: '3000',
          COMMAND_TIMEOUT: '7000',
          SCHEDULE_WORKER_ENABLED: 'true',
          SCHEDULE_POLL_INTERVAL_MS: '500',
          SCHEDULE_BATCH_SIZE: '10',
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

      const operatorJwt = await issueJwt({
        cncPort,
        bearerToken: operatorToken,
        role: 'operator',
        sub: 'cross-service-smoke-operator',
      });
      const adminJwt = await issueJwt({
        cncPort,
        bearerToken: adminToken,
        role: 'admin',
        sub: 'cross-service-smoke-admin',
      });
      const cncAuthHeaders = {
        Authorization: `Bearer ${operatorJwt}`,
      };
      const cncAdminAuthHeaders = {
        Authorization: `Bearer ${adminJwt}`,
      };
      const nodeAgentBaseUrl = `http://${LOCALHOST}:${nodeAgentPort}`;
      const cncBaseUrl = `http://${LOCALHOST}:${cncPort}`;

      const fetchCncHosts = async (): Promise<Array<Record<string, unknown>>> => {
        const response = await fetchJson(`${cncBaseUrl}/api/hosts`, {
          headers: cncAuthHeaders,
        });
        if (response.status !== 200 || !isRecord(response.body) || !Array.isArray(response.body.hosts)) {
          throw new Error(`Unexpected /api/hosts response: status=${response.status} body=${response.rawBody}`);
        }

        return response.body.hosts.filter(isRecord);
      };

      const fetchAdminCommands = async (): Promise<Array<Record<string, unknown>>> => {
        const response = await fetchJson(`${cncBaseUrl}/api/admin/commands?limit=200`, {
          headers: cncAdminAuthHeaders,
        });

        if (response.status !== 200 || !isRecord(response.body) || !Array.isArray(response.body.commands)) {
          throw new Error(
            `Unexpected /api/admin/commands response: status=${response.status} body=${response.rawBody}`
          );
        }

        return response.body.commands.filter(isRecord);
      };

      const forbiddenAdminResponse = await fetchJson(`${cncBaseUrl}/api/admin/commands`, {
        headers: cncAuthHeaders,
      });
      expect(forbiddenAdminResponse.status).toBe(403);

      const initialAdminResponse = await fetchJson(`${cncBaseUrl}/api/admin/commands`, {
        headers: cncAdminAuthHeaders,
      });
      expect(initialAdminResponse.status).toBe(200);
      expect(isRecord(initialAdminResponse.body)).toBe(true);
      if (!isRecord(initialAdminResponse.body)) {
        throw new Error(`Expected admin response object, got: ${initialAdminResponse.rawBody}`);
      }
      expect(Array.isArray(initialAdminResponse.body.commands)).toBe(true);

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
          const response = await fetchJson(`${nodeAgentBaseUrl}/health`);
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
          const response = await fetchJson(`${cncBaseUrl}/api/nodes`, {
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
          const hosts = await fetchCncHosts();
          return hosts.some(
            (host) =>
              host.fullyQualifiedName === SMOKE_HOST_FQN &&
              host.nodeId === SMOKE_NODE_ID
          );
        },
      });

      const manualHostName = 'MANUAL-CRUD-SMOKE';
      const manualHostFqn = `${manualHostName}@${encodeURIComponent(SMOKE_LOCATION)}-${SMOKE_NODE_ID}`;

      const createResponse = await fetchJson(`${nodeAgentBaseUrl}/hosts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: manualHostName,
          mac: 'AA:BB:CC:DD:EE:55',
          ip: '192.168.10.55',
        }),
      });
      expect(createResponse.status).toBe(201);

      await waitForCondition({
        description: 'manual host create propagation to C&C',
        timeoutMs: 20_000,
        check: async () => {
          const hosts = await fetchCncHosts();
          return hosts.some(
            (host) =>
              host.fullyQualifiedName === manualHostFqn &&
              host.name === manualHostName &&
              host.nodeId === SMOKE_NODE_ID
          );
        },
      });

      const updateResponse = await fetchJson(`${nodeAgentBaseUrl}/hosts/${encodeURIComponent(manualHostName)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notes: 'manual propagation note',
          tags: ['smoke', 'manual'],
        }),
      });
      expect(updateResponse.status).toBe(200);

      await waitForCondition({
        description: 'manual host update propagation to C&C',
        timeoutMs: 20_000,
        check: async () => {
          const hosts = await fetchCncHosts();
          const updated = hosts.find((host) => host.fullyQualifiedName === manualHostFqn);
          if (!updated) {
            return false;
          }

          const tags = Array.isArray(updated.tags)
            ? updated.tags.filter((tag): tag is string => typeof tag === 'string')
            : [];

          return (
            updated.notes === 'manual propagation note' &&
            tags.includes('smoke') &&
            tags.includes('manual')
          );
        },
      });

      const deleteResponse = await fetchJson(`${nodeAgentBaseUrl}/hosts/${encodeURIComponent(manualHostName)}`, {
        method: 'DELETE',
      });
      expect(deleteResponse.status).toBe(200);

      await waitForCondition({
        description: 'manual host delete propagation to C&C',
        timeoutMs: 20_000,
        check: async () => {
          const hosts = await fetchCncHosts();
          return !hosts.some((host) => host.fullyQualifiedName === manualHostFqn);
        },
      });

      const wakeupResponse = await fetchJson(
        `${cncBaseUrl}/api/hosts/wakeup/${encodeURIComponent(SMOKE_HOST_FQN)}`,
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
      expect(typeof wakeupResponse.body.commandId).toBe('string');

      if (wakeupResponse.status === 200) {
        expect(wakeupResponse.body.success).toBe(true);
        expect(wakeupResponse.body.nodeId).toBe(SMOKE_NODE_ID);
      } else {
        expect(wakeupResponse.body.error).toBe('Internal Server Error');
        expect(typeof wakeupResponse.body.message).toBe('string');
      }

      const scheduleCreateResponse = await fetchJson(
        `${cncBaseUrl}/api/hosts/${encodeURIComponent(SMOKE_HOST_FQN)}/schedules`,
        {
          method: 'POST',
          headers: {
            ...cncAuthHeaders,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            scheduledTime: new Date(Date.now() + 4_000).toISOString(),
            frequency: 'once',
            enabled: true,
            notifyOnWake: false,
            timezone: 'UTC',
          }),
        }
      );
      expect(scheduleCreateResponse.status).toBe(201);
      expect(isRecord(scheduleCreateResponse.body)).toBe(true);
      if (!isRecord(scheduleCreateResponse.body)) {
        throw new Error(`Schedule create response body was not JSON object: ${scheduleCreateResponse.rawBody}`);
      }

      const scheduleId = asString(scheduleCreateResponse.body.id);
      if (!scheduleId) {
        throw new Error(`Schedule create response missing id: ${scheduleCreateResponse.rawBody}`);
      }

      await waitForCondition({
        description: 'once schedule execution',
        timeoutMs: 40_000,
        check: async () => {
          const response = await fetchJson(`${cncBaseUrl}/api/schedules/${encodeURIComponent(scheduleId)}`, {
            headers: cncAuthHeaders,
          });

          if (response.status !== 200 || !isRecord(response.body)) {
            return false;
          }

          return response.body.enabled === false && typeof response.body.lastTriggered === 'string';
        },
      });

      await nodeAgentService.stop();

      await waitForCondition({
        description: 'C&C node disconnect propagation',
        timeoutMs: 30_000,
        check: async () => {
          const response = await fetchJson(`${cncBaseUrl}/api/nodes`, {
            headers: cncAuthHeaders,
          });

          if (response.status !== 200 || !isRecord(response.body) || !Array.isArray(response.body.nodes)) {
            return false;
          }

          return response.body.nodes.some(
            (node) => isRecord(node) && node.id === SMOKE_NODE_ID && node.connected === false
          );
        },
      });

      const queuedWakeResponse = await fetchJson(
        `${cncBaseUrl}/api/hosts/wakeup/${encodeURIComponent(SMOKE_HOST_FQN)}`,
        {
          method: 'POST',
          headers: {
            ...cncAuthHeaders,
            'Idempotency-Key': 'cross-service-smoke-wakeup-offline',
          },
        }
      );
      expect(queuedWakeResponse.status).toBe(200);
      expect(isRecord(queuedWakeResponse.body)).toBe(true);
      if (!isRecord(queuedWakeResponse.body)) {
        throw new Error(`Queued wake response body was not JSON object: ${queuedWakeResponse.rawBody}`);
      }
      expect(queuedWakeResponse.body.state).toBe('queued');

      const queuedCommandId = asString(queuedWakeResponse.body.commandId);
      if (!queuedCommandId) {
        throw new Error(`Queued wake response missing commandId: ${queuedWakeResponse.rawBody}`);
      }

      await waitForCondition({
        description: 'queued command visible in admin listing',
        timeoutMs: 20_000,
        check: async () => {
          const commands = await fetchAdminCommands();
          return commands.some(
            (command) => command.id === queuedCommandId && command.state === 'queued'
          );
        },
      });

      const reconnectedNodeAgentService = startService({
        name: 'node-agent-reconnect',
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
      services.push(reconnectedNodeAgentService);

      await waitForCondition({
        description: 'node-agent reconnect /health agent.connected',
        timeoutMs: 30_000,
        check: async () => {
          const response = await fetchJson(`${nodeAgentBaseUrl}/health`);
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
        description: 'queued wake command flushed after reconnect',
        timeoutMs: 40_000,
        check: async () => {
          const commands = await fetchAdminCommands();
          const queuedCommand = commands.find((command) => command.id === queuedCommandId);
          if (!queuedCommand) {
            return false;
          }

          return ['acknowledged', 'failed', 'timed_out'].includes(String(queuedCommand.state));
        },
      });
    } catch (error) {
      const baseMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`${baseMessage}\n\nCaptured service logs:\n${formatServiceLogs(services)}`);
    }
  });
});
