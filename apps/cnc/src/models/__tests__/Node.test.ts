/**
 * Simple test to verify node registration
 */

import { NodeModel } from '../Node';
import db from '../../database/connection';
import { PROTOCOL_VERSION } from '@kaonis/woly-protocol';

describe('NodeModel', () => {
  beforeAll(async () => {
    await db.connect();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await db.query('DELETE FROM aggregated_hosts WHERE node_id LIKE $1', ['test-%']);
    await db.query('DELETE FROM nodes WHERE id LIKE $1', ['test-%']);
  });

  afterAll(async () => {
    await db.close();
  });

  describe('register', () => {
    it('should register a new node', async () => {
      const registration = {
        nodeId: 'test-node-1',
        name: 'Test Node',
        location: 'Test Location',
        authToken: 'test-token',
        publicUrl: 'https://test-node.example.trycloudflare.com',
        metadata: {
          version: '1.0.0',
          platform: 'linux',
          protocolVersion: PROTOCOL_VERSION,
          networkInfo: {
            subnet: '192.168.1.0/24',
            gateway: '192.168.1.1',
          },
        },
      };

      const node = await NodeModel.register(registration);

      expect(node.id).toBe('test-node-1');
      expect(node.name).toBe('Test Node');
      expect(node.location).toBe('Test Location');
      expect(node.publicUrl).toBe('https://test-node.example.trycloudflare.com');
      expect(node.status).toBe('online');
      expect(node.metadata).toEqual(registration.metadata);
    });

    it('should update existing node on re-registration', async () => {
      const registration = {
        nodeId: 'test-node-1',
        name: 'Updated Node',
        location: 'Updated Location',
        authToken: 'test-token',
        publicUrl: 'https://updated-node.example.trycloudflare.com',
        metadata: {
          version: '1.0.1',
          platform: 'linux',
          protocolVersion: PROTOCOL_VERSION,
          networkInfo: {
            subnet: '192.168.1.0/24',
            gateway: '192.168.1.1',
          },
        },
      };

      const node = await NodeModel.register(registration);

      expect(node.name).toBe('Updated Node');
      expect(node.location).toBe('Updated Location');
      expect(node.publicUrl).toBe('https://updated-node.example.trycloudflare.com');
      expect(node.metadata.version).toBe('1.0.1');
    });
  });

  describe('findById', () => {
    it('should find node by ID', async () => {
      // Register a node first
      await NodeModel.register({
        nodeId: 'test-node-1',
        name: 'Test Node',
        location: 'Test Location',
        authToken: 'test-token',
        metadata: {
          version: '1.0.0',
          platform: 'linux',
          protocolVersion: PROTOCOL_VERSION,
          networkInfo: {
            subnet: '192.168.1.0/24',
            gateway: '192.168.1.1',
          },
        },
      });

      const node = await NodeModel.findById('test-node-1');

      expect(node).not.toBeNull();
      expect(node!.id).toBe('test-node-1');
    });

    it('should return null for non-existent node', async () => {
      const node = await NodeModel.findById('non-existent');

      expect(node).toBeNull();
    });
  });

  describe('updateHeartbeat', () => {
    it('should update node heartbeat', async () => {
      // Register a node first
      await NodeModel.register({
        nodeId: 'test-node-1',
        name: 'Test Node',
        location: 'Test Location',
        authToken: 'test-token',
        metadata: {
          version: '1.0.0',
          platform: 'linux',
          protocolVersion: PROTOCOL_VERSION,
          networkInfo: {
            subnet: '192.168.1.0/24',
            gateway: '192.168.1.1',
          },
        },
      });

      const before = await NodeModel.findById('test-node-1');
      // SQLite CURRENT_TIMESTAMP has second precision, wait longer
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      await NodeModel.updateHeartbeat('test-node-1');
      
      const after = await NodeModel.findById('test-node-1');

      expect(after!.lastHeartbeat.getTime()).toBeGreaterThanOrEqual(before!.lastHeartbeat.getTime());
      expect(after!.status).toBe('online');
    });
  });

  describe('findAll', () => {
    it('should return all nodes', async () => {
      // Register a node first
      await NodeModel.register({
        nodeId: 'test-node-1',
        name: 'Test Node',
        location: 'Test Location',
        authToken: 'test-token',
        metadata: {
          version: '1.0.0',
          platform: 'linux',
          protocolVersion: PROTOCOL_VERSION,
          networkInfo: {
            subnet: '192.168.1.0/24',
            gateway: '192.168.1.1',
          },
        },
      });

      const nodes = await NodeModel.findAll();

      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes.some((n: any) => n.id === 'test-node-1')).toBe(true);
    });
  });

  describe('markStaleNodesOffline', () => {
    it('should mark nodes offline after timeout', async () => {
      // Register a node and don't send heartbeat
      await NodeModel.register({
        nodeId: 'test-stale-node',
        name: 'Stale Node',
        location: 'Test',
        authToken: 'test',
        metadata: {
          version: '1.0.0',
          platform: 'linux',
          protocolVersion: PROTOCOL_VERSION,
          networkInfo: { subnet: '10.0.0.0/24', gateway: '10.0.0.1' },
        },
      });

      // Manually set old heartbeat (2 minutes ago)
      // Use cross-database compatible syntax
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      await db.query(
        `UPDATE nodes SET last_heartbeat = $1 WHERE id = $2`,
        [twoMinutesAgo, 'test-stale-node']
      );

      // Mark stale nodes offline (anything older than 1 minute)
      const count = await NodeModel.markStaleNodesOffline(60000);

      expect(count).toBeGreaterThan(0);

      const node = await NodeModel.findById('test-stale-node');
      expect(node!.status).toBe('offline');
    });
  });

  describe('delete', () => {
    it('should delete a node', async () => {
      // Register a node to delete
      await NodeModel.register({
        nodeId: 'test-delete-node',
        name: 'Delete Test Node',
        location: 'Test',
        authToken: 'test',
        metadata: {
          version: '1.0.0',
          platform: 'linux',
          protocolVersion: PROTOCOL_VERSION,
          networkInfo: {
            subnet: '192.168.1.0/24',
            gateway: '192.168.1.1',
          },
        },
      });

      const deleted = await NodeModel.delete('test-delete-node');

      expect(deleted).toBe(true);

      const node = await NodeModel.findById('test-delete-node');
      expect(node).toBeNull();
    });

    it('should return false for non-existent node', async () => {
      const deleted = await NodeModel.delete('non-existent');

      expect(deleted).toBe(false);
    });
  });

  describe('getStatusCounts', () => {
    it('should return status counts', async () => {
      const counts = await NodeModel.getStatusCounts();

      expect(counts).toHaveProperty('online');
      expect(counts).toHaveProperty('offline');
      expect(typeof counts.online).toBe('number');
      expect(typeof counts.offline).toBe('number');
    });
  });
});
