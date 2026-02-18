/**
 * Database initialization script
 * Run this to set up the database schema
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import db from './database/connection';
import logger from './utils/logger';

type DatabaseClient = {
  connect: () => Promise<void>;
  query: (text: string) => Promise<{ rows: unknown[]; rowCount: number }>;
  close: () => Promise<void>;
};
type InitDbLogger = Pick<typeof logger, 'info' | 'error'>;
type InitDbOptions = {
  dbClient?: DatabaseClient;
  readFile?: typeof readFileSync;
  log?: InitDbLogger;
  exit?: (code: number) => void;
  dbType?: string;
  schemaRootDir?: string;
};

export function getTableName(row: unknown): string | null {
  if (!row || typeof row !== 'object') {
    return null;
  }
  const maybeName = (row as Record<string, unknown>).table_name;
  return typeof maybeName === 'string' ? maybeName : null;
}

export async function initDatabase(options: InitDbOptions = {}): Promise<void> {
  const dbClient = options.dbClient ?? db;
  const readFile = options.readFile ?? readFileSync;
  const log = options.log ?? logger;
  const exit = options.exit ?? process.exit;

  try {
    log.info('Starting database initialization...');

    // Determine database type from config
    const dbType = options.dbType ?? process.env.DB_TYPE ?? 'postgres';

    // Connect to database
    await dbClient.connect();

    // Read and execute appropriate schema
    const schemaFile = dbType === 'sqlite' ? 'schema.sqlite.sql' : 'schema.sql';
    const schemaPath = join(options.schemaRootDir ?? __dirname, 'database', schemaFile);
    const schema = readFile(schemaPath, 'utf-8');

    log.info(`Executing ${dbType} schema...`);
    await dbClient.query(schema);

    log.info('Database initialized successfully!');

    // Verify tables exist (database-specific queries)
    if (dbType === 'sqlite') {
      const result = await dbClient.query(`
        SELECT name as table_name
        FROM sqlite_master
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `);
      const tables = result.rows.map(getTableName).filter((tableName): tableName is string => Boolean(tableName));
      log.info('Created tables:', {
        tables
      });
    } else {
      const result = await dbClient.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
      `);
      const tables = result.rows.map(getTableName).filter((tableName): tableName is string => Boolean(tableName));
      log.info('Created tables:', {
        tables
      });
    }

    await dbClient.close();
    exit(0);
  } catch (error) {
    log.error('Database initialization failed', { error });
    exit(1);
  }
}

export function runInitDbCli(
  currentModule: NodeModule,
  mainModule: NodeModule | undefined = require.main,
  runner: () => Promise<void> = () => initDatabase(),
): Promise<void> | null {
  if (mainModule !== currentModule) {
    return null;
  }

  return runner();
}

void runInitDbCli(module);
