/**
 * Unit tests for SQLite database adapter
 * Tests RETURNING clause handling for INSERT, UPDATE, DELETE operations
 */

import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync, existsSync } from 'fs';
import SqliteDatabase from '../sqlite-connection';

// Mock config before importing SqliteDatabase
jest.mock('../../config', () => ({
  databaseUrl: process.env.TEST_DB_PATH || ':memory:',
  dbType: 'sqlite',
}));

describe('SqliteDatabase', () => {
  let db: SqliteDatabase;
  let testDbPath: string;

  beforeEach(async () => {
    // Create a unique test database path for each test
    testDbPath = join(tmpdir(), `test-sqlite-${Date.now()}-${Math.random()}.db`);
    
    // Set environment variable for config mock
    process.env.TEST_DB_PATH = testDbPath;
    
    // Create a fresh database instance
    // Note: Due to module caching, this will still use :memory: from setupEnv.ts
    // But that's fine - in-memory DBs provide good isolation between tests
    db = new SqliteDatabase();
    await db.connect();

    // Create test tables
    await db.query(`
      CREATE TABLE IF NOT EXISTS test_nodes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'offline'
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS test_hosts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node_id TEXT NOT NULL,
        name TEXT NOT NULL,
        mac TEXT NOT NULL
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS test_commands (
        id TEXT PRIMARY KEY,
        node_id TEXT NOT NULL,
        type TEXT NOT NULL
      )
    `);
  });

  afterEach(async () => {
    await db.close();
    // Clean up test database file if it exists
    if (existsSync(testDbPath)) {
      try {
        unlinkSync(testDbPath);
      } catch (_error) {
        // Ignore errors if file doesn't exist
      }
    }
  });

  describe('INSERT with RETURNING', () => {
    it('should return inserted row from nodes table', async () => {
      const result = await db.query(
        'INSERT INTO test_nodes (id, name, status) VALUES ($1, $2, $3) RETURNING *',
        ['node-1', 'Test Node', 'online']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].id).toBe('node-1');
      expect(result.rows[0].name).toBe('Test Node');
      expect(result.rows[0].status).toBe('online');
      expect(result.rowCount).toBe(1);
    });

    it('should return inserted row from hosts table', async () => {
      const result = await db.query(
        'INSERT INTO test_hosts (node_id, name, mac) VALUES ($1, $2, $3) RETURNING *',
        ['node-1', 'TestHost', '00:11:22:33:44:55']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].node_id).toBe('node-1');
      expect(result.rows[0].name).toBe('TestHost');
      expect(result.rows[0].mac).toBe('00:11:22:33:44:55');
      expect(result.rows[0].id).toBeDefined();
      expect(result.rowCount).toBe(1);
    });

    it('should return inserted row from commands table', async () => {
      const result = await db.query(
        'INSERT INTO test_commands (id, node_id, type) VALUES ($1, $2, $3) RETURNING *',
        ['cmd-1', 'node-1', 'wake']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].id).toBe('cmd-1');
      expect(result.rows[0].node_id).toBe('node-1');
      expect(result.rows[0].type).toBe('wake');
      expect(result.rowCount).toBe(1);
    });

    it('should handle INSERT without RETURNING', async () => {
      const result = await db.query(
        'INSERT INTO test_nodes (id, name, status) VALUES ($1, $2, $3)',
        ['node-2', 'Test Node 2', 'offline']
      );

      expect(result.rows).toHaveLength(0);
      expect(result.rowCount).toBe(1);
    });
  });

  describe('UPDATE with RETURNING', () => {
    beforeEach(async () => {
      // Insert test data
      await db.query(
        'INSERT INTO test_nodes (id, name, status) VALUES ($1, $2, $3)',
        ['node-1', 'Original Name', 'offline']
      );
      await db.query(
        'INSERT INTO test_nodes (id, name, status) VALUES ($1, $2, $3)',
        ['node-2', 'Node 2', 'offline']
      );
    });

    it('should return updated rows', async () => {
      const result = await db.query(
        'UPDATE test_nodes SET status = $1 WHERE id = $2 RETURNING *',
        ['online', 'node-1']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].id).toBe('node-1');
      expect(result.rows[0].status).toBe('online');
      expect(result.rowCount).toBe(1);
    });

    it('should return multiple updated rows', async () => {
      const result = await db.query(
        'UPDATE test_nodes SET status = $1 RETURNING *',
        ['online']
      );

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].status).toBe('online');
      expect(result.rows[1].status).toBe('online');
      expect(result.rowCount).toBe(2);
    });

    it('should handle UPDATE without RETURNING', async () => {
      const result = await db.query(
        'UPDATE test_nodes SET status = $1 WHERE id = $2',
        ['online', 'node-1']
      );

      expect(result.rows).toHaveLength(0);
      expect(result.rowCount).toBe(1);
    });

    it('should return empty array when no rows updated', async () => {
      const result = await db.query(
        'UPDATE test_nodes SET status = $1 WHERE id = $2 RETURNING *',
        ['online', 'non-existent']
      );

      expect(result.rows).toHaveLength(0);
      expect(result.rowCount).toBe(0);
    });
  });

  describe('DELETE with RETURNING', () => {
    beforeEach(async () => {
      // Insert test data
      await db.query(
        'INSERT INTO test_nodes (id, name, status) VALUES ($1, $2, $3)',
        ['node-1', 'Node 1', 'online']
      );
      await db.query(
        'INSERT INTO test_nodes (id, name, status) VALUES ($1, $2, $3)',
        ['node-2', 'Node 2', 'offline']
      );
      await db.query(
        'INSERT INTO test_nodes (id, name, status) VALUES ($1, $2, $3)',
        ['node-3', 'Node 3', 'offline']
      );
    });

    it('should return deleted row', async () => {
      const result = await db.query(
        'DELETE FROM test_nodes WHERE id = $1 RETURNING *',
        ['node-1']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].id).toBe('node-1');
      expect(result.rows[0].name).toBe('Node 1');
      expect(result.rowCount).toBe(1);

      // Verify deletion
      const checkResult = await db.query('SELECT * FROM test_nodes WHERE id = $1', ['node-1']);
      expect(checkResult.rows).toHaveLength(0);
    });

    it('should return multiple deleted rows', async () => {
      const result = await db.query(
        'DELETE FROM test_nodes WHERE status = $1 RETURNING *',
        ['offline']
      );

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].status).toBe('offline');
      expect(result.rows[1].status).toBe('offline');
      expect(result.rowCount).toBe(2);

      // Verify only online node remains
      const checkResult = await db.query('SELECT * FROM test_nodes');
      expect(checkResult.rows).toHaveLength(1);
      expect(checkResult.rows[0].status).toBe('online');
    });

    it('should handle DELETE without RETURNING', async () => {
      const result = await db.query(
        'DELETE FROM test_nodes WHERE id = $1',
        ['node-1']
      );

      expect(result.rows).toHaveLength(0);
      expect(result.rowCount).toBe(1);
    });

    it('should return empty array when no rows deleted', async () => {
      const result = await db.query(
        'DELETE FROM test_nodes WHERE id = $1 RETURNING *',
        ['non-existent']
      );

      expect(result.rows).toHaveLength(0);
      expect(result.rowCount).toBe(0);
    });
  });

  describe('PostgreSQL-style placeholders', () => {
    it('should convert $1, $2 placeholders to ? for SQLite', async () => {
      const result = await db.query(
        'INSERT INTO test_nodes (id, name, status) VALUES ($1, $2, $3) RETURNING *',
        ['node-1', 'Test', 'online']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].id).toBe('node-1');
    });
  });

  describe('SELECT queries', () => {
    beforeEach(async () => {
      await db.query(
        'INSERT INTO test_nodes (id, name, status) VALUES ($1, $2, $3)',
        ['node-1', 'Node 1', 'online']
      );
    });

    it('should return rows for SELECT query', async () => {
      const result = await db.query('SELECT * FROM test_nodes WHERE id = $1', ['node-1']);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].id).toBe('node-1');
      expect(result.rowCount).toBe(1);
    });

    it('should return empty array for SELECT with no results', async () => {
      const result = await db.query('SELECT * FROM test_nodes WHERE id = $1', ['non-existent']);

      expect(result.rows).toHaveLength(0);
      expect(result.rowCount).toBe(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle INSERT with AUTOINCREMENT primary key', async () => {
      const result = await db.query(
        'INSERT INTO test_hosts (node_id, name, mac) VALUES ($1, $2, $3) RETURNING *',
        ['node-1', 'Host1', 'AA:BB:CC:DD:EE:FF']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].id).toBeGreaterThan(0);
      expect(result.rows[0].name).toBe('Host1');
    });

    it('should handle case-insensitive INSERT keyword', async () => {
      const result = await db.query(
        'insert into test_nodes (id, name, status) values ($1, $2, $3) RETURNING *',
        ['node-lower', 'Lower Case', 'online']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].id).toBe('node-lower');
    });

    it('should handle table names with underscores', async () => {
      const result = await db.query(
        'INSERT INTO test_hosts (node_id, name, mac) VALUES ($1, $2, $3) RETURNING *',
        ['node-1', 'UnderscoreTest', '11:22:33:44:55:66']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe('UnderscoreTest');
    });
  });

  describe('Connection management', () => {
    it('should throw error when querying without connection', async () => {
      const disconnectedDb = new SqliteDatabase();
      
      await expect(
        disconnectedDb.query('SELECT 1')
      ).rejects.toThrow('Database not connected');
    });

    it('should handle multiple queries in sequence', async () => {
      await db.query(
        'INSERT INTO test_nodes (id, name, status) VALUES ($1, $2, $3)',
        ['node-1', 'Node 1', 'online']
      );
      await db.query(
        'INSERT INTO test_nodes (id, name, status) VALUES ($1, $2, $3)',
        ['node-2', 'Node 2', 'offline']
      );
      
      const result = await db.query('SELECT * FROM test_nodes ORDER BY id');
      expect(result.rows).toHaveLength(2);
    });
  });
});
