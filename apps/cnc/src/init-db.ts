/**
 * Database initialization script
 * Run this to set up the database schema
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import db from './database/connection';
import logger from './utils/logger';

function getTableName(row: unknown): string | null {
  if (!row || typeof row !== 'object') {
    return null;
  }
  const maybeName = (row as Record<string, unknown>).table_name;
  return typeof maybeName === 'string' ? maybeName : null;
}

async function initDatabase(): Promise<void> {
  try {
    logger.info('Starting database initialization...');

    // Determine database type from config
    const dbType = process.env.DB_TYPE || 'postgres';

    // Connect to database
    await db.connect();

    // Read and execute appropriate schema
    const schemaFile = dbType === 'sqlite' ? 'schema.sqlite.sql' : 'schema.sql';
    const schemaPath = join(__dirname, 'database', schemaFile);
    const schema = readFileSync(schemaPath, 'utf-8');

    logger.info(`Executing ${dbType} schema...`);
    await db.query(schema);

    logger.info('Database initialized successfully!');

    // Verify tables exist (database-specific queries)
    if (dbType === 'sqlite') {
      const result = await db.query(`
        SELECT name as table_name
        FROM sqlite_master
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `);
      const tables = result.rows.map(getTableName).filter((tableName): tableName is string => Boolean(tableName));
      logger.info('Created tables:', {
        tables
      });
    } else {
      const result = await db.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
      `);
      const tables = result.rows.map(getTableName).filter((tableName): tableName is string => Boolean(tableName));
      logger.info('Created tables:', {
        tables
      });
    }

    await db.close();
    process.exit(0);
  } catch (error) {
    logger.error('Database initialization failed', { error });
    process.exit(1);
  }
}

initDatabase();
