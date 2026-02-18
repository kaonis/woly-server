import Database from 'better-sqlite3';
import { EventEmitter } from 'events';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { logger } from '../utils/logger';
import * as networkDiscovery from './networkDiscovery';
import { Host, HostMergeCandidate } from '../types';

/**
 * Database Service
 * Manages host synchronization and updates
 */

const HOST_SELECT_COLUMNS =
  'name, mac, secondary_macs as secondaryMacs, ip, status, wol_port as wolPort, lastSeen, discovered, pingResponsive, notes, tags, power_config as powerControl';

class HostDatabase extends EventEmitter {
  private db: Database.Database | null = null;
  private maxRetries: number = 3;
  private retryDelay: number = 1000; // 1 second
  private ready: Promise<void>;
  private readyResolve!: () => void;
  private readyReject!: (error: Error) => void;

  constructor(dbPath: string = './db/woly.db') {
    super();
    this.ready = new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    this.connectWithRetry(dbPath);
  }

  private assertReady(): Database.Database {
    if (!this.db) {
      throw new Error('Database is not connected');
    }

    return this.db;
  }

  private parseTags(value: unknown, hostName: string): string[] {
    if (Array.isArray(value)) {
      return value.filter((tag): tag is string => typeof tag === 'string');
    }

    if (typeof value !== 'string' || value.trim().length === 0) {
      return [];
    }

    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((tag): tag is string => typeof tag === 'string');
      }
    } catch (error) {
      logger.warn('Failed to parse host tag metadata; falling back to empty tags', {
        hostName,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return [];
  }

  private serializeTags(tags: string[] | undefined): string {
    if (!tags || tags.length === 0) {
      return '[]';
    }

    return JSON.stringify(tags);
  }

  private normalizeSecondaryMacs(
    secondaryMacs: string[] | undefined,
    primaryMac: string
  ): string[] {
    if (!secondaryMacs || secondaryMacs.length === 0) {
      return [];
    }

    const normalizedPrimary = networkDiscovery.formatMAC(primaryMac);
    const deduped = new Set<string>();

    for (const candidate of secondaryMacs) {
      if (typeof candidate !== 'string' || candidate.trim().length === 0) {
        continue;
      }
      try {
        const normalized = networkDiscovery.formatMAC(candidate);
        if (normalized !== normalizedPrimary) {
          deduped.add(normalized);
        }
      } catch {
        // Ignore malformed MAC values from stale rows/manual edits.
      }
    }

    return Array.from(deduped);
  }

  private parseSecondaryMacs(value: unknown, hostName: string, primaryMac: string): string[] {
    if (Array.isArray(value)) {
      return this.normalizeSecondaryMacs(
        value.filter((entry): entry is string => typeof entry === 'string'),
        primaryMac
      );
    }

    if (typeof value !== 'string' || value.trim().length === 0) {
      return [];
    }

    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return this.normalizeSecondaryMacs(
          parsed.filter((entry): entry is string => typeof entry === 'string'),
          primaryMac
        );
      }
    } catch (error) {
      logger.warn('Failed to parse host secondary MAC metadata; falling back to empty list', {
        hostName,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return [];
  }

  private serializeSecondaryMacs(secondaryMacs: string[] | undefined, primaryMac: string): string {
    return JSON.stringify(this.normalizeSecondaryMacs(secondaryMacs, primaryMac));
  }

  private normalizeLastSeen(value: string | null): string | null {
    if (!value) {
      return null;
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }

    let normalized = trimmed;

    // SQLite datetime('now') / CURRENT_TIMESTAMP is UTC without timezone.
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
      normalized = `${trimmed.replace(' ', 'T')}Z`;
    } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(trimmed)) {
      // Timestamp without explicit timezone: treat as UTC.
      normalized = `${trimmed}Z`;
    }

    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      return trimmed;
    }

    return parsed.toISOString();
  }

  private normalizeWolPort(value: unknown): number {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65_535) {
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number.parseInt(value, 10);
      if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 65_535) {
        return parsed;
      }
    }

    return 9;
  }

  private parsePowerControl(value: unknown, hostName: string): Host['powerControl'] | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    let parsed: unknown = value;
    if (typeof value === 'string') {
      if (value.trim().length === 0) {
        return undefined;
      }

      try {
        parsed = JSON.parse(value) as unknown;
      } catch (error) {
        logger.warn('Failed to parse host power control metadata; falling back to undefined', {
          hostName,
          error: error instanceof Error ? error.message : String(error),
        });
        return undefined;
      }
    }

    if (parsed === null) {
      return null;
    }

    if (!parsed || typeof parsed !== 'object') {
      return undefined;
    }

    const candidate = parsed as {
      enabled?: unknown;
      transport?: unknown;
      platform?: unknown;
      ssh?: unknown;
      commands?: unknown;
    };

    if (typeof candidate.enabled !== 'boolean' || candidate.transport !== 'ssh') {
      return undefined;
    }

    if (
      candidate.platform !== 'linux' &&
      candidate.platform !== 'macos' &&
      candidate.platform !== 'windows'
    ) {
      return undefined;
    }

    if (!candidate.ssh || typeof candidate.ssh !== 'object') {
      return undefined;
    }

    const sshCandidate = candidate.ssh as {
      username?: unknown;
      port?: unknown;
      privateKeyPath?: unknown;
      strictHostKeyChecking?: unknown;
    };

    const username = typeof sshCandidate.username === 'string' ? sshCandidate.username.trim() : '';
    if (!username) {
      return undefined;
    }

    let port: number | undefined;
    if (sshCandidate.port !== undefined) {
      if (
        typeof sshCandidate.port !== 'number' ||
        !Number.isInteger(sshCandidate.port) ||
        sshCandidate.port < 1 ||
        sshCandidate.port > 65_535
      ) {
        return undefined;
      }
      port = sshCandidate.port;
    }

    let privateKeyPath: string | undefined;
    if (sshCandidate.privateKeyPath !== undefined) {
      if (typeof sshCandidate.privateKeyPath !== 'string') {
        return undefined;
      }
      const normalizedPath = sshCandidate.privateKeyPath.trim();
      if (!normalizedPath) {
        return undefined;
      }
      privateKeyPath = normalizedPath;
    }

    let strictHostKeyChecking: 'enforce' | 'accept-new' | 'off' | undefined;
    if (sshCandidate.strictHostKeyChecking !== undefined) {
      if (
        sshCandidate.strictHostKeyChecking !== 'enforce' &&
        sshCandidate.strictHostKeyChecking !== 'accept-new' &&
        sshCandidate.strictHostKeyChecking !== 'off'
      ) {
        return undefined;
      }
      strictHostKeyChecking = sshCandidate.strictHostKeyChecking;
    }

    let commands: { sleep?: string; shutdown?: string } | undefined;
    if (candidate.commands !== undefined) {
      if (!candidate.commands || typeof candidate.commands !== 'object') {
        return undefined;
      }

      const commandCandidate = candidate.commands as { sleep?: unknown; shutdown?: unknown };
      const sleep =
        typeof commandCandidate.sleep === 'string' && commandCandidate.sleep.trim().length > 0
          ? commandCandidate.sleep.trim()
          : undefined;
      const shutdown =
        typeof commandCandidate.shutdown === 'string' && commandCandidate.shutdown.trim().length > 0
          ? commandCandidate.shutdown.trim()
          : undefined;

      if (sleep || shutdown) {
        commands = {};
        if (sleep) {
          commands.sleep = sleep;
        }
        if (shutdown) {
          commands.shutdown = shutdown;
        }
      }
    }

    return {
      enabled: candidate.enabled,
      transport: 'ssh',
      platform: candidate.platform,
      ssh: {
        username,
        ...(port !== undefined ? { port } : {}),
        ...(privateKeyPath ? { privateKeyPath } : {}),
        ...(strictHostKeyChecking ? { strictHostKeyChecking } : {}),
      },
      ...(commands ? { commands } : {}),
    };
  }

  private serializePowerControl(powerControl: Host['powerControl'] | undefined): string | null {
    if (powerControl === undefined || powerControl === null) {
      return null;
    }

    return JSON.stringify(powerControl);
  }

  private normalizeHostRow(
    row: Host & { tags?: unknown; wolPort?: unknown; secondaryMacs?: unknown; powerControl?: unknown }
  ): Host {
    const {
      wolPort: rawWolPort,
      tags: rawTags,
      secondaryMacs: rawSecondaryMacs,
      powerControl: rawPowerControl,
      ...base
    } = row;
    const secondaryMacs = this.parseSecondaryMacs(rawSecondaryMacs, base.name, base.mac);
    const powerControl = this.parsePowerControl(rawPowerControl, base.name);

    return {
      ...base,
      ...(secondaryMacs.length > 0 ? { secondaryMacs } : {}),
      lastSeen: this.normalizeLastSeen(base.lastSeen),
      wolPort: this.normalizeWolPort(rawWolPort),
      notes: base.notes ?? null,
      tags: this.parseTags(rawTags, base.name),
      ...(powerControl !== undefined ? { powerControl } : {}),
    };
  }

  private subnetHintForIp(ip: string): string | null {
    const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(ip.trim());
    if (!ipv4Match) {
      return null;
    }

    return `${ipv4Match[1]}.${ipv4Match[2]}.${ipv4Match[3]}.x/24`;
  }

  private hostMacSet(host: Host): Set<string> {
    return new Set<string>([host.mac, ...(host.secondaryMacs ?? [])]);
  }

  private hostsShareAnyMac(first: Host, second: Host): boolean {
    const firstSet = this.hostMacSet(first);
    const secondSet = this.hostMacSet(second);
    for (const mac of firstSet) {
      if (secondSet.has(mac)) {
        return true;
      }
    }
    return false;
  }

  private addColumnIfMissing(columnDefinition: string): void {
    const db = this.assertReady();
    try {
      db.exec(`ALTER TABLE hosts ADD COLUMN ${columnDefinition}`);
    } catch (err) {
      const error = err as Error;
      if (!error.message.includes('duplicate column')) {
        logger.warn(`Could not add ${columnDefinition.split(' ')[0]} column:`, {
          error: error.message,
        });
      }
    }
  }

  /**
   * Connect to database with retry logic
   */
  private connectWithRetry(dbPath: string, attempt: number = 1): void {
    try {
      // Ensure parent directory exists
      const dir = dirname(dbPath);
      const created = mkdirSync(dir, { recursive: true });
      if (created) {
        logger.info(`Created database directory: ${dir}`);
      }

      this.db = new Database(dbPath);
      logger.info('Connected to the WoLy database.');
      this.readyResolve();
    } catch (err) {
      const error = err as Error;
      logger.error(`Database connection error (attempt ${attempt}/${this.maxRetries}):`, {
        error: error.message,
      });

      if (attempt < this.maxRetries) {
        logger.info(`Retrying database connection in ${this.retryDelay}ms...`);
        setTimeout(() => {
          this.connectWithRetry(dbPath, attempt + 1);
        }, this.retryDelay * attempt); // Exponential backoff
      } else {
        const fatalError = new Error('Failed to connect to database after multiple attempts');
        logger.error('Max database connection retries reached.');
        this.readyReject(fatalError);
      }
    }
  }

  /**
   * Initialize database with table
   */
  async initialize(): Promise<void> {
    // Wait for database connection to be ready
    await this.ready;

    this.createTable();
    // Database is ready
  }

  /**
   * Create hosts table if not exists
   */
  createTable(): void {
    const db = this.assertReady();
    db.exec(`CREATE TABLE IF NOT EXISTS hosts(
      name text PRIMARY KEY UNIQUE,
      mac text NOT NULL UNIQUE,
      secondary_macs text NOT NULL DEFAULT '[]',
      ip text NOT NULL UNIQUE,
      status text NOT NULL,
      wol_port integer NOT NULL DEFAULT 9,
      lastSeen datetime,
      discovered integer DEFAULT 0,
      pingResponsive integer,
      notes text,
      tags text NOT NULL DEFAULT '[]',
      power_config text
    )`);

    // Keep runtime schema compatible with older databases.
    this.addColumnIfMissing('pingResponsive integer');
    this.addColumnIfMissing('notes text');
    this.addColumnIfMissing("tags text NOT NULL DEFAULT '[]'");
    this.addColumnIfMissing('wol_port integer NOT NULL DEFAULT 9');
    this.addColumnIfMissing("secondary_macs text NOT NULL DEFAULT '[]'");
    this.addColumnIfMissing('power_config text');
    try {
      db.exec('UPDATE hosts SET wol_port = 9 WHERE wol_port IS NULL');
    } catch (err) {
      const error = err as Error;
      logger.warn('Could not normalize wol_port defaults', { error: error.message });
    }
    try {
      db.exec("UPDATE hosts SET secondary_macs = '[]' WHERE secondary_macs IS NULL");
    } catch (err) {
      const error = err as Error;
      logger.warn('Could not normalize secondary_macs defaults', { error: error.message });
    }
  }

  /**
   * Get all hosts from database
   */
  async getAllHosts(): Promise<Host[]> {
    try {
      const db = this.assertReady();
      const rows = db
        .prepare(`SELECT ${HOST_SELECT_COLUMNS} FROM hosts ORDER BY name`)
        .all() as Array<
        Host & { tags?: unknown; wolPort?: unknown; secondaryMacs?: unknown; powerControl?: unknown }
      >;

      return rows.map((row) => this.normalizeHostRow(row));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get all hosts:', { error: message });
      throw error;
    }
  }

  /**
   * Get a single host by name
   */
  async getHost(name: string): Promise<Host | undefined> {
    try {
      const db = this.assertReady();
      const row = db
        .prepare(`SELECT ${HOST_SELECT_COLUMNS} FROM hosts WHERE name = ?`)
        .get(name) as
        | (Host & { tags?: unknown; wolPort?: unknown; secondaryMacs?: unknown; powerControl?: unknown })
        | undefined;

      return row ? this.normalizeHostRow(row) : undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to get host ${name}:`, { error: message });
      throw error;
    }
  }

  /**
   * Get a single host by MAC address
   */
  async getHostByMAC(mac: string): Promise<Host | undefined> {
    try {
      const db = this.assertReady();
      const formattedMac = networkDiscovery.formatMAC(mac);
      const row = db
        .prepare(`SELECT ${HOST_SELECT_COLUMNS} FROM hosts WHERE mac = ?`)
        .get(formattedMac) as
        | (Host & { tags?: unknown; wolPort?: unknown; secondaryMacs?: unknown; powerControl?: unknown })
        | undefined;

      if (row) {
        return this.normalizeHostRow(row);
      }

      const secondaryRow = db
        .prepare(
          `SELECT ${HOST_SELECT_COLUMNS}
           FROM hosts
           WHERE EXISTS (
             SELECT 1
             FROM json_each(COALESCE(secondary_macs, '[]'))
             WHERE value = ?
           )
           ORDER BY lastSeen DESC
           LIMIT 1`
        )
        .get(formattedMac) as
        | (Host & { tags?: unknown; wolPort?: unknown; secondaryMacs?: unknown; powerControl?: unknown })
        | undefined;

      return secondaryRow ? this.normalizeHostRow(secondaryRow) : undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to get host by MAC ${mac}:`, { error: message });
      throw error;
    }
  }

  /**
   * Add a new host to database
   */
  addHost(
    name: string,
    mac: string,
    ip: string,
    metadata?: {
      notes?: string | null;
      tags?: string[];
      wolPort?: number;
      secondaryMacs?: string[];
      powerControl?: Host['powerControl'];
    },
    options?: { emitLifecycleEvent?: boolean }
  ): Promise<Host> {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO hosts(name, mac, secondary_macs, ip, status, wol_port, lastSeen, discovered, pingResponsive, notes, tags, power_config)
                   VALUES(?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 0, NULL, ?, ?, ?)`;
      try {
        const db = this.assertReady();
        const formattedMac = networkDiscovery.formatMAC(mac);
        const notes = metadata?.notes ?? null;
        const tags = this.serializeTags(metadata?.tags);
        const secondaryMacs = this.normalizeSecondaryMacs(metadata?.secondaryMacs, formattedMac);
        const wolPort = this.normalizeWolPort(metadata?.wolPort);
        const powerControl = metadata?.powerControl ?? undefined;
        const serializedPowerControl = this.serializePowerControl(powerControl);
        db.prepare(sql).run(
          name,
          formattedMac,
          this.serializeSecondaryMacs(secondaryMacs, formattedMac),
          ip,
          'asleep',
          wolPort,
          notes,
          tags,
          serializedPowerControl
        );
        logger.info(`Added host: ${name}`);
        const createdHost: Host = {
          name,
          mac: formattedMac,
          ...(secondaryMacs.length > 0 ? { secondaryMacs } : {}),
          ip,
          status: 'asleep',
          wolPort,
          lastSeen: new Date().toISOString(),
          discovered: 0,
          pingResponsive: null,
          notes,
          tags: this.parseTags(tags, name),
          ...(powerControl !== undefined ? { powerControl } : {}),
        };
        if (options?.emitLifecycleEvent ?? true) {
          this.emit('host-discovered', createdHost);
        }
        resolve(createdHost);
      } catch (err) {
        const error = err as Error;
        if (error.message.includes('UNIQUE constraint failed')) {
          logger.warn(`Host ${name} already exists`);
        }
        reject(error);
      }
    });
  }

  /**
   * Update host's last seen time, status, and mark as discovered
   * Throws error if host not found
   */
  async updateHostSeen(
    mac: string,
    status: 'awake' | 'asleep' = 'awake',
    pingResponsive: number | null = null
  ): Promise<void> {
    const db = this.assertReady();
    const formattedMac = networkDiscovery.formatMAC(mac);
    const host = await this.getHostByMAC(formattedMac);

    if (!host) {
      throw new Error(`Host with MAC ${formattedMac} not found in database`);
    }

    let primaryMac = host.mac;
    let secondaryMacs = host.secondaryMacs ?? [];
    if (host.mac !== formattedMac) {
      secondaryMacs = secondaryMacs.filter((candidate) => candidate !== formattedMac);
      secondaryMacs = this.normalizeSecondaryMacs([...secondaryMacs, host.mac], formattedMac);
      primaryMac = formattedMac;
    }

    const info = db
      .prepare(
        `UPDATE hosts
         SET mac = ?,
             secondary_macs = ?,
             lastSeen = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
             discovered = 1,
             status = ?,
             pingResponsive = ?
         WHERE name = ?`
      )
      .run(
        primaryMac,
        this.serializeSecondaryMacs(secondaryMacs, primaryMac),
        status,
        pingResponsive,
        host.name
      );

    if (info.changes === 0) {
      throw new Error(`Host ${host.name} not found in database`);
    }
  }

  /**
   * Update host properties by name
   */
  updateHost(
    name: string,
    updates: Partial<
      Pick<Host, 'name' | 'mac' | 'secondaryMacs' | 'ip' | 'wolPort' | 'status' | 'notes' | 'tags' | 'powerControl'>
    >,
    options?: { emitLifecycleEvent?: boolean }
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let db: Database.Database;
      try {
        db = this.assertReady();
      } catch (err) {
        reject(err);
        return;
      }

      const hasRequestedUpdate =
        updates.name !== undefined ||
        updates.mac !== undefined ||
        updates.secondaryMacs !== undefined ||
        updates.ip !== undefined ||
        updates.wolPort !== undefined ||
        updates.status !== undefined ||
        updates.notes !== undefined ||
        updates.tags !== undefined ||
        updates.powerControl !== undefined;
      if (!hasRequestedUpdate) {
        resolve();
        return;
      }

      const existingRow = db
        .prepare(`SELECT ${HOST_SELECT_COLUMNS} FROM hosts WHERE name = ?`)
        .get(name) as
        | (Host & { tags?: unknown; wolPort?: unknown; secondaryMacs?: unknown; powerControl?: unknown })
        | undefined;
      if (!existingRow) {
        reject(new Error(`Host ${name} not found`));
        return;
      }

      const existing = this.normalizeHostRow(existingRow);
      const nextName = updates.name ?? existing.name;
      const nextMac = updates.mac !== undefined ? networkDiscovery.formatMAC(updates.mac) : existing.mac;
      const nextSecondaryMacs = this.normalizeSecondaryMacs(
        updates.secondaryMacs ?? existing.secondaryMacs,
        nextMac
      );
      const nextIp = updates.ip ?? existing.ip;
      const nextWolPort =
        updates.wolPort !== undefined ? this.normalizeWolPort(updates.wolPort) : (existing.wolPort ?? 9);
      const nextStatus = updates.status ?? existing.status;
      const nextNotes = updates.notes !== undefined ? updates.notes : (existing.notes ?? null);
      const nextTags = updates.tags !== undefined ? updates.tags : (existing.tags ?? []);
      const nextPowerControl =
        updates.powerControl !== undefined ? updates.powerControl : existing.powerControl;

      const hasMeaningfulChange =
        nextName !== existing.name ||
        nextMac !== existing.mac ||
        nextIp !== existing.ip ||
        nextWolPort !== (existing.wolPort ?? 9) ||
        nextStatus !== existing.status ||
        nextNotes !== (existing.notes ?? null) ||
        JSON.stringify(nextTags) !== JSON.stringify(existing.tags ?? []) ||
        JSON.stringify(nextSecondaryMacs) !== JSON.stringify(existing.secondaryMacs ?? []) ||
        JSON.stringify(nextPowerControl ?? null) !== JSON.stringify(existing.powerControl ?? null);

      if (!hasMeaningfulChange) {
        resolve();
        return;
      }

      try {
        const info = db
          .prepare(
            `UPDATE hosts
             SET name = ?,
                 mac = ?,
                 secondary_macs = ?,
                 ip = ?,
                 wol_port = ?,
                 status = ?,
                 notes = ?,
                 tags = ?,
                 power_config = ?
             WHERE name = ?`
          )
          .run(
            nextName,
            nextMac,
            this.serializeSecondaryMacs(nextSecondaryMacs, nextMac),
            nextIp,
            nextWolPort,
            nextStatus,
            nextNotes,
            this.serializeTags(nextTags),
            this.serializePowerControl(nextPowerControl),
            name
          );

        if (info.changes === 0) {
          reject(new Error(`Host ${name} not found`));
        } else {
          const resolvedName = updates.name ?? name;
          const updatedRow = db
            .prepare(`SELECT ${HOST_SELECT_COLUMNS} FROM hosts WHERE name = ?`)
            .get(resolvedName) as
            | (Host & { tags?: unknown; wolPort?: unknown; secondaryMacs?: unknown; powerControl?: unknown })
            | undefined;
          if (updatedRow && (options?.emitLifecycleEvent ?? true)) {
            this.emit('host-updated', this.normalizeHostRow(updatedRow));
          }
          resolve();
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  async mergeHostMac(
    name: string,
    mac: string,
    options?: { makePrimary?: boolean }
  ): Promise<Host> {
    const db = this.assertReady();
    const host = await this.getHost(name);
    if (!host) {
      throw new Error(`Host ${name} not found`);
    }

    const formattedMac = networkDiscovery.formatMAC(mac);
    const makePrimary = options?.makePrimary ?? false;
    const existingSecondary = host.secondaryMacs ?? [];

    let nextPrimary = host.mac;
    let nextSecondary: string[];

    if (makePrimary) {
      nextPrimary = formattedMac;
      nextSecondary = this.normalizeSecondaryMacs(
        [...existingSecondary.filter((candidate) => candidate !== formattedMac), host.mac],
        nextPrimary
      );
    } else {
      nextSecondary = this.normalizeSecondaryMacs([...existingSecondary, formattedMac], host.mac);
    }

    const info = db
      .prepare('UPDATE hosts SET mac = ?, secondary_macs = ? WHERE name = ?')
      .run(nextPrimary, this.serializeSecondaryMacs(nextSecondary, nextPrimary), name);

    if (info.changes === 0) {
      throw new Error(`Host ${name} not found`);
    }

    const updated = await this.getHost(name);
    if (!updated) {
      throw new Error(`Failed to load host ${name} after merge`);
    }

    this.emit('host-updated', updated);
    return updated;
  }

  async unmergeHostMac(name: string, mac: string): Promise<Host> {
    const db = this.assertReady();
    const host = await this.getHost(name);
    if (!host) {
      throw new Error(`Host ${name} not found`);
    }

    const formattedMac = networkDiscovery.formatMAC(mac);
    const existingSecondary = host.secondaryMacs ?? [];

    let nextPrimary = host.mac;
    let nextSecondary: string[];

    if (formattedMac === host.mac) {
      if (existingSecondary.length === 0) {
        throw new Error(`Host ${name} has no secondary MACs to promote`);
      }
      nextPrimary = existingSecondary[0];
      nextSecondary = existingSecondary.slice(1);
    } else if (existingSecondary.includes(formattedMac)) {
      nextSecondary = existingSecondary.filter((candidate) => candidate !== formattedMac);
    } else {
      throw new Error(`MAC ${formattedMac} is not associated with host ${name}`);
    }

    const info = db
      .prepare('UPDATE hosts SET mac = ?, secondary_macs = ? WHERE name = ?')
      .run(nextPrimary, this.serializeSecondaryMacs(nextSecondary, nextPrimary), name);

    if (info.changes === 0) {
      throw new Error(`Host ${name} not found`);
    }

    const updated = await this.getHost(name);
    if (!updated) {
      throw new Error(`Failed to load host ${name} after unmerge`);
    }

    this.emit('host-updated', updated);
    return updated;
  }

  async getMergeCandidates(): Promise<HostMergeCandidate[]> {
    const hosts = await this.getAllHosts();
    const candidates: HostMergeCandidate[] = [];

    for (let i = 0; i < hosts.length; i += 1) {
      for (let j = i + 1; j < hosts.length; j += 1) {
        const first = hosts[i];
        const second = hosts[j];
        if (first.name.trim().toLowerCase() !== second.name.trim().toLowerCase()) {
          continue;
        }

        const firstSubnet = this.subnetHintForIp(first.ip);
        const secondSubnet = this.subnetHintForIp(second.ip);
        if (!firstSubnet || !secondSubnet || firstSubnet !== secondSubnet) {
          continue;
        }

        if (this.hostsShareAnyMac(first, second)) {
          continue;
        }

        const target = first;
        const candidate = second;
        candidates.push({
          targetName: target.name,
          targetMac: target.mac,
          targetIp: target.ip,
          candidateName: candidate.name,
          candidateMac: candidate.mac,
          candidateIp: candidate.ip,
          subnetHint: firstSubnet,
          reason: 'same_hostname_subnet',
        });
      }
    }

    return candidates;
  }

  /**
   * Delete host by name
   */
  deleteHost(name: string, options?: { emitLifecycleEvent?: boolean }): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM hosts WHERE name = ?';
      try {
        const db = this.assertReady();
        const info = db.prepare(sql).run(name);
        if (info.changes === 0) {
          reject(new Error(`Host ${name} not found`));
        } else {
          if (options?.emitLifecycleEvent ?? true) {
            this.emit('host-removed', name);
          }
          resolve();
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Update host status
   */
  updateHostStatus(name: string, status: 'awake' | 'asleep'): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = 'UPDATE hosts SET status = ? WHERE name = ?';
      try {
        const db = this.assertReady();
        db.prepare(sql).run(status, name);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Close database connection
   */
  close(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        if (!this.db) {
          logger.info('Database connection already closed');
          resolve();
          return;
        }
        this.db.close();
        this.db = null;
        logger.info('Database connection closed');
        resolve();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to close database connection:', { error: message });
        reject(error);
      }
    });
  }
}

export default HostDatabase;
