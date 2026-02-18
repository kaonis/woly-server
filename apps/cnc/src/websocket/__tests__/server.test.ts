import { EventEmitter } from 'events';
import type { IncomingMessage, Server as HTTPServer } from 'http';
import type WebSocket from 'ws';
import config from '../../config';
import type { NodeManager } from '../../services/nodeManager';
import { createWebSocketServer } from '../server';
import { authenticateWsUpgrade } from '../upgradeAuth';

jest.mock('../upgradeAuth', () => ({
  authenticateWsUpgrade: jest.fn(),
}));

type MockSocket = {
  write: jest.Mock;
  destroy: jest.Mock;
};

type MockNodeManager = Pick<NodeManager, 'handleConnection'>;

function createUpgradeRequest(
  ip: string,
  forwardedFor?: string | string[],
  path = '/ws/node'
): IncomingMessage {
  return {
    url: path,
    headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
    socket: { remoteAddress: ip },
  } as unknown as IncomingMessage;
}

function createMockSocket(): MockSocket {
  return {
    write: jest.fn(),
    destroy: jest.fn(),
  };
}

describe('createWebSocketServer', () => {
  const originalMaxConnectionsPerIp = config.wsMaxConnectionsPerIp;
  const originalRequireTls = config.wsRequireTls;
  const mockAuthenticateWsUpgrade = authenticateWsUpgrade as jest.MockedFunction<
    typeof authenticateWsUpgrade
  >;

  let httpServer: HTTPServer;
  let nodeManager: MockNodeManager;
  let upgradedSocketsQueue: WebSocket[];

  beforeEach(() => {
    (config as any).wsMaxConnectionsPerIp = 1;
    (config as any).wsRequireTls = false;
    mockAuthenticateWsUpgrade.mockReturnValue({ kind: 'static-token', token: 'dev-token-home' });
    httpServer = new EventEmitter() as unknown as HTTPServer;
    nodeManager = {
      handleConnection: jest.fn().mockResolvedValue(undefined),
    };
    upgradedSocketsQueue = [];
  });

  afterEach(() => {
    (config as any).wsMaxConnectionsPerIp = originalMaxConnectionsPerIp;
    (config as any).wsRequireTls = originalRequireTls;
  });

  function setupWss() {
    const wss = createWebSocketServer(httpServer, nodeManager as NodeManager);
    const handleUpgradeSpy = jest.spyOn(wss, 'handleUpgrade').mockImplementation(
      (request, _socket, _head, callback) => {
        const upgradedSocket = upgradedSocketsQueue.shift();
        if (!upgradedSocket) {
          throw new Error('No upgraded WebSocket prepared for handleUpgrade callback');
        }
        callback(upgradedSocket, request);
      }
    );
    return { wss, handleUpgradeSpy };
  }

  it('rejects websocket upgrades when per-IP connection limit is exceeded', () => {
    const { handleUpgradeSpy } = setupWss();
    const firstWs = new EventEmitter() as unknown as WebSocket;
    upgradedSocketsQueue.push(firstWs);

    const firstSocket = createMockSocket();
    httpServer.emit('upgrade', createUpgradeRequest('10.0.0.5'), firstSocket, Buffer.alloc(0));

    const secondSocket = createMockSocket();
    httpServer.emit('upgrade', createUpgradeRequest('10.0.0.5'), secondSocket, Buffer.alloc(0));

    expect(handleUpgradeSpy).toHaveBeenCalledTimes(1);
    expect(nodeManager.handleConnection).toHaveBeenCalledTimes(1);
    expect(secondSocket.write).toHaveBeenCalledWith('HTTP/1.1 429 Too Many Requests\r\n\r\n');
    expect(secondSocket.destroy).toHaveBeenCalledTimes(1);
  });

  it('releases per-IP connection slots after websocket close', () => {
    const { handleUpgradeSpy } = setupWss();
    const firstWs = new EventEmitter() as unknown as WebSocket;
    const secondWs = new EventEmitter() as unknown as WebSocket;
    upgradedSocketsQueue.push(firstWs, secondWs);

    const firstSocket = createMockSocket();
    httpServer.emit(
      'upgrade',
      createUpgradeRequest('10.0.0.8', '203.0.113.1, 198.51.100.2'),
      firstSocket,
      Buffer.alloc(0)
    );
    firstWs.emit('close');

    const secondSocket = createMockSocket();
    httpServer.emit('upgrade', createUpgradeRequest('10.0.0.99', '203.0.113.1'), secondSocket, Buffer.alloc(0));

    expect(handleUpgradeSpy).toHaveBeenCalledTimes(2);
    expect(nodeManager.handleConnection).toHaveBeenCalledTimes(2);
    expect(secondSocket.write).not.toHaveBeenCalled();
    expect(secondSocket.destroy).not.toHaveBeenCalled();
  });

  it('rejects non-node websocket upgrade paths', () => {
    const { handleUpgradeSpy } = setupWss();
    const socket = createMockSocket();

    httpServer.emit('upgrade', createUpgradeRequest('10.0.0.2', undefined, '/ws/unknown'), socket, Buffer.alloc(0));

    expect(handleUpgradeSpy).not.toHaveBeenCalled();
    expect(socket.destroy).toHaveBeenCalledTimes(1);
  });

  it('rejects non-TLS upgrade requests when TLS is required', () => {
    (config as any).wsRequireTls = true;
    const { handleUpgradeSpy } = setupWss();
    const socket = createMockSocket();

    httpServer.emit('upgrade', createUpgradeRequest('10.0.0.3'), socket, Buffer.alloc(0));

    expect(handleUpgradeSpy).not.toHaveBeenCalled();
    expect(socket.write).toHaveBeenCalledWith('HTTP/1.1 426 Upgrade Required\r\n\r\n');
    expect(socket.destroy).toHaveBeenCalledTimes(1);
  });

  it('rejects upgrade requests when websocket auth fails', () => {
    mockAuthenticateWsUpgrade.mockReturnValue(null);
    const { handleUpgradeSpy } = setupWss();
    const socket = createMockSocket();

    httpServer.emit('upgrade', createUpgradeRequest('10.0.0.4'), socket, Buffer.alloc(0));

    expect(handleUpgradeSpy).not.toHaveBeenCalled();
    expect(socket.write).toHaveBeenCalledWith('HTTP/1.1 401 Unauthorized\r\n\r\n');
    expect(socket.destroy).toHaveBeenCalledTimes(1);
  });

  it('uses the first forwarded-for header value when an array is provided', () => {
    const { handleUpgradeSpy } = setupWss();
    const firstWs = new EventEmitter() as unknown as WebSocket;
    upgradedSocketsQueue.push(firstWs);

    const firstSocket = createMockSocket();
    httpServer.emit(
      'upgrade',
      createUpgradeRequest('10.0.0.50', ['198.51.100.50', '203.0.113.50']),
      firstSocket,
      Buffer.alloc(0)
    );

    const secondSocket = createMockSocket();
    httpServer.emit('upgrade', createUpgradeRequest('10.0.0.60', '198.51.100.50'), secondSocket, Buffer.alloc(0));

    expect(handleUpgradeSpy).toHaveBeenCalledTimes(1);
    expect(secondSocket.write).toHaveBeenCalledWith('HTTP/1.1 429 Too Many Requests\r\n\r\n');
    expect(secondSocket.destroy).toHaveBeenCalledTimes(1);
  });
});
