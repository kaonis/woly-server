/**
 * Tests for NodeManager service
 */

import { NodeManager } from '../nodeManager';
import { HostAggregator } from '../hostAggregator';
import { NodeModel } from '../../models/Node';
import WebSocket from 'ws';
import db from '../../database/connection';
import { PROTOCOL_VERSION } from '@kaonis/woly-protocol';
import config from '../../config';
import { mintWsSessionToken } from '../../websocket/sessionTokens';
import { runtimeMetrics } from '../runtimeMetrics';

// Mock WebSocket
jest.mock('ws');

describe('NodeManager', () => {
  const defaultWsMessageRateLimitPerSecond = config.wsMessageRateLimitPerSecond;
  let nodeManager: NodeManager;
  let hostAggregator: HostAggregator;
  let mockWs: any;

  beforeAll(async () => {
    await db.connect();
  });

  beforeEach(async () => {
    (config as any).wsMessageRateLimitPerSecond = defaultWsMessageRateLimitPerSecond;
    runtimeMetrics.reset(0);
    hostAggregator = new HostAggregator();
    nodeManager = new NodeManager(hostAggregator);

    // Clean up test data
    await db.query('DELETE FROM aggregated_hosts WHERE node_id LIKE $1', ['test-ws-%']);
    await db.query('DELETE FROM nodes WHERE id LIKE $1', ['test-ws-%']);

    // Mock WebSocket
    mockWs = {
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      readyState: WebSocket.OPEN,
    };
  });

  afterEach(() => {
    nodeManager.shutdown();
  });

  afterAll(async () => {
    await db.close();
  });

  describe('handleConnection', () => {
    it('should reject connection with invalid auth token', async () => {
      await nodeManager.handleConnection(mockWs, { kind: 'static-token', token: 'invalid-token' });

      expect(mockWs.close).toHaveBeenCalledWith(4001, 'Invalid authentication token');
    });

    it('should accept connection with valid auth token', async () => {
      await nodeManager.handleConnection(mockWs, { kind: 'static-token', token: 'dev-token-home' });

      expect(mockWs.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockWs.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockWs.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('message handling', () => {
    it('should handle registration message', async () => {
      await nodeManager.handleConnection(mockWs, { kind: 'static-token', token: 'dev-token-home' });

      // Get message handler
      const messageHandler = mockWs.on.mock.calls.find((call: any) => call[0] === 'message')[1];

      const registrationMessage = JSON.stringify({
        type: 'register',
        data: {
          nodeId: 'test-ws-node-1',
          name: 'Test WS Node',
          location: 'WS Test Location',
          authToken: 'dev-token-home',
          metadata: {
            version: '1.0.0',
            platform: 'linux',
            protocolVersion: PROTOCOL_VERSION,
            networkInfo: {
              subnet: '192.168.1.0/24',
              gateway: '192.168.1.1',
            },
          },
        },
      });

      await messageHandler(Buffer.from(registrationMessage));

      expect(mockWs.send).toHaveBeenCalled();
      const sentData = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentData.type).toBe('registered');
      expect(sentData.data.nodeId).toBe('test-ws-node-1');

      // Verify node was registered in database
      const node = await NodeModel.findById('test-ws-node-1');
      expect(node).not.toBeNull();
      expect(node!.name).toBe('Test WS Node');
    });

    it('rejects re-registration on an already registered connection', async () => {
      await nodeManager.handleConnection(mockWs, { kind: 'static-token', token: 'dev-token-home' });
      const messageHandler = mockWs.on.mock.calls.find((call: any) => call[0] === 'message')[1];

      const firstRegistration = JSON.stringify({
        type: 'register',
        data: {
          nodeId: 'test-ws-node-reregister',
          name: 'Test WS Node',
          location: 'WS Test Location',
          authToken: 'dev-token-home',
          metadata: {
            version: '1.0.0',
            platform: 'linux',
            protocolVersion: PROTOCOL_VERSION,
            networkInfo: { subnet: '192.168.1.0/24', gateway: '192.168.1.1' },
          },
        },
      });

      await messageHandler(Buffer.from(firstRegistration));

      const secondRegistration = JSON.stringify({
        type: 'register',
        data: {
          nodeId: 'another-node-id',
          name: 'Another Node',
          location: 'Other',
          authToken: 'dev-token-home',
          metadata: {
            version: '1.0.0',
            platform: 'linux',
            protocolVersion: PROTOCOL_VERSION,
            networkInfo: { subnet: '192.168.1.0/24', gateway: '192.168.1.1' },
          },
        },
      });

      await messageHandler(Buffer.from(secondRegistration));
      expect(mockWs.close).toHaveBeenCalledWith(4409, 'Already registered');
    });

    it('increments protocol validation telemetry when schema validation fails', async () => {
      await nodeManager.handleConnection(mockWs, { kind: 'static-token', token: 'dev-token-home' });
      const messageHandler = mockWs.on.mock.calls.find((call: any) => call[0] === 'message')[1];

      const invalidMessage = JSON.stringify({
        type: 'heartbeat',
        data: {},
      });

      expect(nodeManager.getProtocolValidationStats().total).toBe(0);
      await messageHandler(Buffer.from(invalidMessage));
      expect(nodeManager.getProtocolValidationStats().total).toBe(1);
    });

    it('rejects registration when static-token differs from payload authToken', async () => {
      await nodeManager.handleConnection(mockWs, { kind: 'static-token', token: 'dev-token-home' });
      const messageHandler = mockWs.on.mock.calls.find((call: any) => call[0] === 'message')[1];

      const registrationMessage = JSON.stringify({
        type: 'register',
        data: {
          nodeId: 'test-ws-node-static-mismatch',
          name: 'Static Token Mismatch Node',
          location: 'WS Test Location',
          authToken: 'some-other-token',
          metadata: {
            version: '1.0.0',
            platform: 'linux',
            protocolVersion: PROTOCOL_VERSION,
            networkInfo: { subnet: '192.168.1.0/24', gateway: '192.168.1.1' },
          },
        },
      });

      await messageHandler(Buffer.from(registrationMessage));
      expect(mockWs.close).toHaveBeenCalledWith(4001, 'Invalid authentication token');
    });

    it('rejects registration when session-token subject differs from payload nodeId', async () => {
      const minted = mintWsSessionToken('node-session-1', {
        issuer: config.wsSessionTokenIssuer,
        audience: config.wsSessionTokenAudience,
        ttlSeconds: config.wsSessionTokenTtlSeconds,
        secrets: config.wsSessionTokenSecrets,
      });

      await nodeManager.handleConnection(mockWs, {
        kind: 'session-token',
        token: minted.token,
        nodeId: 'forged-node',
        expiresAt: 0,
      });

      const messageHandler = mockWs.on.mock.calls.find((call: any) => call[0] === 'message')[1];

      const registrationMessage = JSON.stringify({
        type: 'register',
        data: {
          nodeId: 'different-node-id',
          name: 'Session Token Mismatch Node',
          location: 'WS Test Location',
          authToken: 'dev-token-home',
          metadata: {
            version: '1.0.0',
            platform: 'linux',
            protocolVersion: PROTOCOL_VERSION,
            networkInfo: { subnet: '192.168.1.0/24', gateway: '192.168.1.1' },
          },
        },
      });

      await messageHandler(Buffer.from(registrationMessage));
      expect(mockWs.close).toHaveBeenCalledWith(
        4401,
        'Registration nodeId does not match session token'
      );
    });

    it('should handle heartbeat message', async () => {
      // First register a node
      await NodeModel.register({
        nodeId: 'test-ws-node-2',
        name: 'Heartbeat Test Node',
        location: 'Test',
        authToken: 'dev-token-home',
        metadata: {
          version: '1.0.0',
          platform: 'linux',
          protocolVersion: PROTOCOL_VERSION,
          networkInfo: { subnet: '10.0.0.0/24', gateway: '10.0.0.1' },
        },
      });

      await nodeManager.handleConnection(mockWs, { kind: 'static-token', token: 'dev-token-home' });
      const messageHandler = mockWs.on.mock.calls.find((call: any) => call[0] === 'message')[1];

      const heartbeatMessage = JSON.stringify({
        type: 'heartbeat',
        data: {
          nodeId: 'test-ws-node-2',
          timestamp: new Date(),
        },
      });

      await messageHandler(Buffer.from(heartbeatMessage));

      // Verify heartbeat was updated
      const node = await NodeModel.findById('test-ws-node-2');
      expect(node!.status).toBe('online');
    });

    it('should handle invalid message format', async () => {
      await nodeManager.handleConnection(mockWs, { kind: 'static-token', token: 'dev-token-home' });
      const messageHandler = mockWs.on.mock.calls.find((call: any) => call[0] === 'message')[1];

      await messageHandler(Buffer.from('invalid json'));

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('error')
      );
    });

    it('closes connection when inbound message rate exceeds configured limit', async () => {
      (config as any).wsMessageRateLimitPerSecond = 2;
      nodeManager.shutdown();
      nodeManager = new NodeManager(hostAggregator);

      await nodeManager.handleConnection(mockWs, { kind: 'static-token', token: 'dev-token-home' });
      const messageHandler = mockWs.on.mock.calls.find((call: any) => call[0] === 'message')[1];

      await messageHandler(Buffer.from('invalid json'));
      await messageHandler(Buffer.from('invalid json'));
      await messageHandler(Buffer.from('invalid json'));

      expect(mockWs.close).toHaveBeenCalledWith(4408, 'Message rate limit exceeded');
    });

    it('should reject registration with unsupported protocol version', async () => {
      await nodeManager.handleConnection(mockWs, { kind: 'static-token', token: 'dev-token-home' });
      const messageHandler = mockWs.on.mock.calls.find((call: any) => call[0] === 'message')[1];

      const registrationMessage = JSON.stringify({
        type: 'register',
        data: {
          nodeId: 'test-ws-node-unsupported',
          name: 'Unsupported Protocol Node',
          location: 'WS Test Location',
          authToken: 'dev-token-home',
          metadata: {
            version: '1.0.0',
            platform: 'linux',
            protocolVersion: '9.9.9',
            networkInfo: {
              subnet: '192.168.1.0/24',
              gateway: '192.168.1.1',
            },
          },
        },
      });

      await messageHandler(Buffer.from(registrationMessage));
      expect(mockWs.close).toHaveBeenCalledWith(4406, 'Unsupported protocol version');
    });

    it('should bind node identity to connection and ignore spoofed payload nodeId', async () => {
      await nodeManager.handleConnection(mockWs, { kind: 'static-token', token: 'dev-token-home' });
      const messageHandler = mockWs.on.mock.calls.find((call: any) => call[0] === 'message')[1];

      const registrationMessage = JSON.stringify({
        type: 'register',
        data: {
          nodeId: 'test-ws-node-bound',
          name: 'Bound Identity Node',
          location: 'WS Test Location',
          authToken: 'dev-token-home',
          metadata: {
            version: '1.0.0',
            platform: 'linux',
            protocolVersion: PROTOCOL_VERSION,
            networkInfo: {
              subnet: '192.168.1.0/24',
              gateway: '192.168.1.1',
            },
          },
        },
      });

      await messageHandler(Buffer.from(registrationMessage));

      const spoofedHostDiscoveredMessage = JSON.stringify({
        type: 'host-discovered',
        data: {
          nodeId: 'spoof-node',
          name: 'spoofed-host',
          mac: 'AA:BB:CC:DD:EE:11',
          ip: '192.168.1.151',
          status: 'awake',
          lastSeen: new Date().toISOString(),
          discovered: 1,
        },
      });

      await messageHandler(Buffer.from(spoofedHostDiscoveredMessage));

      const boundNodeHosts = await hostAggregator.getHostsByNode('test-ws-node-bound');
      const spoofedNodeHosts = await hostAggregator.getHostsByNode('spoof-node');

      expect(boundNodeHosts.length).toBe(1);
      expect(boundNodeHosts[0].name).toBe('spoofed-host');
      expect(spoofedNodeHosts.length).toBe(0);
    });
  });

  describe('WebSocket close handling', () => {
    it('should mark node hosts unreachable on disconnect', async () => {
      // Register node and add a host
      await NodeModel.register({
        nodeId: 'test-ws-node-3',
        name: 'Disconnect Test',
        location: 'Test Location',
        authToken: 'dev-token-home',
        metadata: {
          version: '1.0.0',
          platform: 'linux',
          protocolVersion: PROTOCOL_VERSION,
          networkInfo: { subnet: '10.0.0.0/24', gateway: '10.0.0.1' },
        },
      });

      await hostAggregator.onHostDiscovered({
        nodeId: 'test-ws-node-3',
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

      await nodeManager.handleConnection(mockWs, { kind: 'static-token', token: 'dev-token-home' });

      // Simulate registration to establish connection
      const messageHandler = mockWs.on.mock.calls.find((call: any) => call[0] === 'message')[1];
      const registrationMessage = JSON.stringify({
        type: 'register',
        data: {
          nodeId: 'test-ws-node-3',
          name: 'Disconnect Test',
          location: 'Test Location',
          authToken: 'dev-token-home',
          metadata: {
            version: '1.0.0',
            platform: 'linux',
            protocolVersion: PROTOCOL_VERSION,
            networkInfo: { subnet: '10.0.0.0/24', gateway: '10.0.0.1' },
          },
        },
      });
      await messageHandler(Buffer.from(registrationMessage));

      // Get close handler and call it
      const closeHandler = mockWs.on.mock.calls.find((call: any) => call[0] === 'close')[1];
      await closeHandler();

      // Verify hosts were marked unreachable
      const hosts = await hostAggregator.getHostsByNode('test-ws-node-3');
      expect(hosts.every(h => h.status === 'asleep')).toBe(true);
      expect(runtimeMetrics.snapshot().nodes.connected).toBe(0);
    });
  });

  describe('sendCommand', () => {
    it('should send command to connected node', async () => {
      // Register and connect node
      await nodeManager.handleConnection(mockWs, { kind: 'static-token', token: 'dev-token-home' });
      const messageHandler = mockWs.on.mock.calls.find((call: any) => call[0] === 'message')[1];

      const registrationMessage = JSON.stringify({
        type: 'register',
        data: {
          nodeId: 'test-ws-node-4',
          name: 'Command Test',
          location: 'Test',
          authToken: 'dev-token-home',
          metadata: {
            version: '1.0.0',
            platform: 'linux',
            protocolVersion: PROTOCOL_VERSION,
            networkInfo: { subnet: '10.0.0.0/24', gateway: '10.0.0.1' },
          },
        },
      });
      await messageHandler(Buffer.from(registrationMessage));

      // Send command
      const command = {
        type: 'wake' as const,
        commandId: 'test-cmd-1',
        data: {
          hostName: 'test-host',
          mac: 'AA:BB:CC:DD:EE:FF',
        },
      };

      nodeManager.sendCommand('test-ws-node-4', command);

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('test-cmd-1')
      );
    });

    it('should throw error when node not connected', () => {
      const command = {
        type: 'wake' as const,
        commandId: 'test-cmd-2',
        data: {
          hostName: 'test-host',
          mac: 'AA:BB:CC:DD:EE:FF',
        },
      };

      expect(() => {
        nodeManager.sendCommand('non-existent-node', command);
      }).toThrow('not connected');
    });
  });

  describe('getConnectedNodes', () => {
    it('should return list of connected node IDs', async () => {
      await nodeManager.handleConnection(mockWs, { kind: 'static-token', token: 'dev-token-home' });
      const messageHandler = mockWs.on.mock.calls.find((call: any) => call[0] === 'message')[1];

      const registrationMessage = JSON.stringify({
        type: 'register',
        data: {
          nodeId: 'test-ws-node-5',
          name: 'Connected Test',
          location: 'Test',
          authToken: 'dev-token-home',
          metadata: {
            version: '1.0.0',
            platform: 'linux',
            protocolVersion: PROTOCOL_VERSION,
            networkInfo: { subnet: '10.0.0.0/24', gateway: '10.0.0.1' },
          },
        },
      });
      await messageHandler(Buffer.from(registrationMessage));

      const connectedNodes = nodeManager.getConnectedNodes();
      expect(connectedNodes).toContain('test-ws-node-5');
      expect(runtimeMetrics.snapshot().nodes.connected).toBe(1);
    });
  });

  describe('isNodeConnected', () => {
    it('should return true for connected node', async () => {
      await nodeManager.handleConnection(mockWs, { kind: 'static-token', token: 'dev-token-home' });
      const messageHandler = mockWs.on.mock.calls.find((call: any) => call[0] === 'message')[1];

      const registrationMessage = JSON.stringify({
        type: 'register',
        data: {
          nodeId: 'test-ws-node-6',
          name: 'Connection Check',
          location: 'Test',
          authToken: 'dev-token-home',
          metadata: {
            version: '1.0.0',
            platform: 'linux',
            protocolVersion: PROTOCOL_VERSION,
            networkInfo: { subnet: '10.0.0.0/24', gateway: '10.0.0.1' },
          },
        },
      });
      await messageHandler(Buffer.from(registrationMessage));

      expect(nodeManager.isNodeConnected('test-ws-node-6')).toBe(true);
      expect(nodeManager.isNodeConnected('non-existent')).toBe(false);
    });
  });

  describe('getNodeStatus', () => {
    it('should return online for connected node', async () => {
      await nodeManager.handleConnection(mockWs, { kind: 'static-token', token: 'dev-token-home' });
      const messageHandler = mockWs.on.mock.calls.find((call: any) => call[0] === 'message')[1];

      const registrationMessage = JSON.stringify({
        type: 'register',
        data: {
          nodeId: 'test-ws-node-7',
          name: 'Status Test',
          location: 'Test',
          authToken: 'dev-token-home',
          metadata: {
            version: '1.0.0',
            platform: 'linux',
            protocolVersion: PROTOCOL_VERSION,
            networkInfo: { subnet: '10.0.0.0/24', gateway: '10.0.0.1' },
          },
        },
      });
      await messageHandler(Buffer.from(registrationMessage));

      const status = await nodeManager.getNodeStatus('test-ws-node-7');
      expect(status).toBe('online');
    });

    it('should return offline for disconnected node', async () => {
      const status = await nodeManager.getNodeStatus('non-existent');
      expect(status).toBe('offline');
    });
  });

  describe('shutdown', () => {
    it('should close all connections', async () => {
      await nodeManager.handleConnection(mockWs, { kind: 'static-token', token: 'dev-token-home' });
      const messageHandler = mockWs.on.mock.calls.find((call: any) => call[0] === 'message')[1];

      const registrationMessage = JSON.stringify({
        type: 'register',
        data: {
          nodeId: 'test-ws-node-8',
          name: 'Shutdown Test',
          location: 'Test',
          authToken: 'dev-token-home',
          metadata: {
            version: '1.0.0',
            platform: 'linux',
            protocolVersion: PROTOCOL_VERSION,
            networkInfo: { subnet: '10.0.0.0/24', gateway: '10.0.0.1' },
          },
        },
      });
      await messageHandler(Buffer.from(registrationMessage));

      nodeManager.shutdown();

      expect(mockWs.close).toHaveBeenCalledWith(1000, 'Server shutdown');
    });
  });
});
