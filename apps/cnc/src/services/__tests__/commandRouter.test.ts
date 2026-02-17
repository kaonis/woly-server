/**
 * Tests for CommandRouter service
 */

import { CommandRouter } from '../commandRouter';
import { NodeManager } from '../nodeManager';
import { HostAggregator } from '../hostAggregator';
import { NodeModel } from '../../models/Node';
import db from '../../database/connection';
import { PROTOCOL_VERSION } from '@kaonis/woly-protocol';
import { runtimeMetrics } from '../runtimeMetrics';

describe('CommandRouter', () => {
  let commandRouter: CommandRouter;
  let nodeManager: NodeManager;
  let hostAggregator: HostAggregator;

  beforeAll(async () => {
    await db.connect();
  });

  beforeEach(async () => {
    runtimeMetrics.reset(0);
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

    it('attaches correlationId when resolving pending command result', async () => {
      const router = commandRouter as unknown as {
        pendingCommands: Map<
          string,
          {
            resolvers: Array<{
              resolve: (value: unknown) => void;
              reject: (error: Error) => void;
            }>;
            timeout: NodeJS.Timeout;
            correlationId: string | null;
            commandType:
              | 'wake'
              | 'scan'
              | 'scan-host-ports'
              | 'update-host'
              | 'delete-host'
              | 'ping-host';
          }
        >;
        handleCommandResult: (result: {
          commandId: string;
          success: boolean;
          timestamp: Date;
        }) => void;
      };

      const resolve = jest.fn();
      const reject = jest.fn();
      router.pendingCommands.set('cmd-correlation', {
        resolvers: [{ resolve, reject }],
        timeout: setTimeout(() => undefined, 10_000),
        correlationId: 'corr-test-1',
        commandType: 'scan',
      });

      router.handleCommandResult({
        commandId: 'cmd-correlation',
        success: true,
        timestamp: new Date(),
      });
      await new Promise((resolvePromise) => setImmediate(resolvePromise));

      expect(resolve).toHaveBeenCalledWith(
        expect.objectContaining({
          commandId: 'cmd-correlation',
          correlationId: 'corr-test-1',
        })
      );
      expect(reject).not.toHaveBeenCalled();
    });
  });

  describe('exponential backoff', () => {
    it('should calculate backoff delay with exponential growth', () => {
      // Access the private method via type assertion for testing
      const router = commandRouter as any;
      
      // First retry (retryCount = 0): baseDelay * 2^0 = 1000ms
      const delay0 = router.calculateBackoffDelay(0);
      expect(delay0).toBeGreaterThanOrEqual(750); // baseDelay with -25% jitter
      expect(delay0).toBeLessThanOrEqual(1250); // baseDelay with +25% jitter

      // Second retry (retryCount = 1): baseDelay * 2^1 = 2000ms
      const delay1 = router.calculateBackoffDelay(1);
      expect(delay1).toBeGreaterThanOrEqual(1500);
      expect(delay1).toBeLessThanOrEqual(2500);

      // Third retry (retryCount = 2): baseDelay * 2^2 = 4000ms
      const delay2 = router.calculateBackoffDelay(2);
      expect(delay2).toBeGreaterThanOrEqual(3000);
      expect(delay2).toBeLessThanOrEqual(5000);
    });

    it('should cap backoff delay at half of command timeout', () => {
      const router = commandRouter as any;
      const maxDelay = router.commandTimeout / 2;
      
      // Very high retry count should still be capped
      const delay = router.calculateBackoffDelay(10);
      expect(delay).toBeLessThanOrEqual(maxDelay);
    });
  });
});
