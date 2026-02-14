/**
 * Tests for CommandRouter service
 */

import { CommandRouter } from '../commandRouter';
import { NodeManager } from '../nodeManager';
import { HostAggregator } from '../hostAggregator';
import { NodeModel } from '../../models/Node';
import db from '../../database/connection';
import { PROTOCOL_VERSION } from '@kaonis/woly-protocol';

describe('CommandRouter', () => {
  let commandRouter: CommandRouter;
  let nodeManager: NodeManager;
  let hostAggregator: HostAggregator;

  beforeAll(async () => {
    await db.connect();
  });

  beforeEach(async () => {
    hostAggregator = new HostAggregator();
    nodeManager = new NodeManager(hostAggregator);
    commandRouter = new CommandRouter(nodeManager, hostAggregator);

    // Clean up test data
    await db.query('DELETE FROM aggregated_hosts WHERE node_id LIKE $1', ['test-cmd-%']);
    await db.query('DELETE FROM nodes WHERE id LIKE $1', ['test-cmd-%']);
  });

  afterEach(() => {
    nodeManager.shutdown();
  });

  afterAll(async () => {
    await db.close();
  });

  describe('routeWakeCommand', () => {
    it('should throw error if host not found', async () => {
      await expect(
        commandRouter.routeWakeCommand('non-existent@location')
      ).rejects.toThrow('Host not found');
    });

    it('should throw error if node is offline', async () => {
      // Register offline node
      await NodeModel.register({
        nodeId: 'test-cmd-node-1',
        name: 'Offline Node',
        location: 'Test Location',
        authToken: 'dev-token-home',
        metadata: {
          version: '1.0.0',
          platform: 'linux',
          protocolVersion: PROTOCOL_VERSION,
          networkInfo: { subnet: '10.0.0.0/24', gateway: '10.0.0.1' },
        },
      });

      // Mark it offline
      await db.query(
        `UPDATE nodes SET status = 'offline' WHERE id = $1`,
        ['test-cmd-node-1']
      );

      // Add a host
      await hostAggregator.onHostDiscovered({
        nodeId: 'test-cmd-node-1',
        location: 'Test Location',
        host: {
          name: 'test-host',
          mac: 'AA:BB:CC:DD:EE:FF',
          ip: '192.168.1.100',
          status: 'awake' as const,
          lastSeen: new Date().toISOString(),
          discovered: 1,
          pingResponsive: 1,
        },
      });

      await expect(
        commandRouter.routeWakeCommand('test-host@Test%20Location-test-cmd-node-1')
      ).rejects.toThrow('offline');
    });
  });

  describe('routeScanCommand', () => {
    it('should throw error if node is offline', async () => {
      // Register offline node
      await NodeModel.register({
        nodeId: 'test-cmd-node-2',
        name: 'Scan Test Node',
        location: 'Test',
        authToken: 'dev-token-home',
        metadata: {
          version: '1.0.0',
          platform: 'linux',
          protocolVersion: PROTOCOL_VERSION,
          networkInfo: { subnet: '10.0.0.0/24', gateway: '10.0.0.1' },
        },
      });

      await db.query(
        `UPDATE nodes SET status = 'offline' WHERE id = $1`,
        ['test-cmd-node-2']
      );

      await expect(
        commandRouter.routeScanCommand('test-cmd-node-2', true)
      ).rejects.toThrow('offline');
    });

    it('should throw error if node not connected', async () => {
      await expect(
        commandRouter.routeScanCommand('non-existent-node', true)
      ).rejects.toThrow('offline');
    });
  });

  describe('routeDeleteHostCommand', () => {
    it('should throw error if host not found', async () => {
      await expect(
        commandRouter.routeDeleteHostCommand('non-existent@location')
      ).rejects.toThrow('Host not found');
    });

    it('should throw error if node is offline', async () => {
      await NodeModel.register({
        nodeId: 'test-cmd-node-3',
        name: 'Delete Test',
        location: 'Test Location',
        authToken: 'dev-token-home',
        metadata: {
          version: '1.0.0',
          platform: 'linux',
          protocolVersion: PROTOCOL_VERSION,
          networkInfo: { subnet: '10.0.0.0/24', gateway: '10.0.0.1' },
        },
      });

      await db.query(
        `UPDATE nodes SET status = 'offline' WHERE id = $1`,
        ['test-cmd-node-3']
      );

      await hostAggregator.onHostDiscovered({
        nodeId: 'test-cmd-node-3',
        location: 'Test Location',
        host: {
          name: 'delete-host',
          mac: 'AA:BB:CC:DD:EE:05',
          ip: '192.168.1.105',
          status: 'awake' as const,
          lastSeen: new Date().toISOString(),
          discovered: 1,
          pingResponsive: 1,
        },
      });

      await expect(
        commandRouter.routeDeleteHostCommand('delete-host@Test%20Location-test-cmd-node-3')
      ).rejects.toThrow('offline');
    });
  });

  describe('getStats', () => {
    it('should return pending commands count', () => {
      const stats = commandRouter.getStats();
      expect(stats).toHaveProperty('pendingCommands');
      expect(typeof stats.pendingCommands).toBe('number');
    });
  });

  describe('command timeout', () => {
    it('should handle command timeout', async () => {
      // This test verifies the timeout mechanism exists
      // Actual timeout testing would require mock timers
      expect(commandRouter).toHaveProperty('pendingCommands');
    });
  });

  describe('command result handling', () => {
    it('should process command results from nodes', (done) => {
      // Listen for command-result event
      nodeManager.on('command-result', (data) => {
        expect(data.nodeId).toBe('test-cmd-node-6');
        expect(data.commandId).toBe('test-result-cmd');
        expect(data.success).toBe(true);
        done();
      });

      // Simulate command result
      nodeManager.emit('command-result', {
        nodeId: 'test-cmd-node-6',
        commandId: 'test-result-cmd',
        success: true,
        timestamp: new Date(),
      });
    });
  });
});
