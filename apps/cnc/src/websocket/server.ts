/**
 * WebSocket server for node-agent and mobile stream communication.
 */

import WebSocket from 'ws';
import { IncomingMessage, Server as HTTPServer } from 'http';
import { NodeManager } from '../services/nodeManager';
import { HostStateStreamBroker } from '../services/hostStateStreamBroker';
import config from '../config';
import logger from '../utils/logger';
import { isRequestTls } from './auth';
import { authenticateWsUpgrade } from './upgradeAuth';
import { authenticateMobileWsUpgrade } from './mobileUpgradeAuth';

const NODE_WS_PATH = '/ws/node';
const MOBILE_HOSTS_WS_PATH = '/ws/mobile/hosts';

export function createWebSocketServer(
  httpServer: HTTPServer,
  nodeManager: NodeManager,
  hostStateStreamBroker: HostStateStreamBroker
): WebSocket.Server {
  const wss = new WebSocket.Server({ noServer: true, maxPayload: 256 * 1024 });
  const wsMaxConnectionsPerIp = Math.max(config.wsMaxConnectionsPerIp, 1);
  const nodeConnectionsPerIp = new Map<string, number>();
  const mobileConnectionsPerIp = new Map<string, number>();

  const decrementConnectionCount = (bucket: Map<string, number>, ip: string): void => {
    const count = bucket.get(ip);
    if (!count) {
      return;
    }

    if (count <= 1) {
      bucket.delete(ip);
      return;
    }

    bucket.set(ip, count - 1);
  };

  const isRateLimited = (
    bucket: Map<string, number>,
    clientIp: string
  ): boolean => {
    const activeConnectionsForIp = bucket.get(clientIp) ?? 0;
    return activeConnectionsForIp >= wsMaxConnectionsPerIp;
  };

  const trackUpgradedConnection = (
    bucket: Map<string, number>,
    clientIp: string,
    ws: WebSocket
  ): void => {
    const activeConnectionsForIp = bucket.get(clientIp) ?? 0;
    bucket.set(clientIp, activeConnectionsForIp + 1);
    ws.once('close', () => {
      decrementConnectionCount(bucket, clientIp);
    });
  };

  // Handle upgrade requests
  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = request.url?.split('?')[0];
    const clientIp = getClientIp(request);

    if (config.wsRequireTls && !isRequestTls(request)) {
      socket.write('HTTP/1.1 426 Upgrade Required\r\n\r\n');
      socket.destroy();
      return;
    }

    if (pathname === NODE_WS_PATH) {
      if (isRateLimited(nodeConnectionsPerIp, clientIp)) {
        logger.warn('WebSocket connection rejected: per-IP connection limit exceeded', {
          clientIp,
          activeConnectionsForIp: nodeConnectionsPerIp.get(clientIp) ?? 0,
          channel: 'node',
          wsMaxConnectionsPerIp,
        });
        socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
        socket.destroy();
        return;
      }

      const authContext = authenticateWsUpgrade(request);
      if (!authContext) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        trackUpgradedConnection(nodeConnectionsPerIp, clientIp, ws);

        // Emit the standard connection event for any listeners, but handle node auth here
        // so we can keep authContext strongly typed without relying on extra event args.
        wss.emit('connection', ws, request);
        logger.info('New node WebSocket connection', { clientIp });
        void nodeManager.handleConnection(ws, authContext);
      });
      return;
    }

    if (pathname === MOBILE_HOSTS_WS_PATH) {
      if (isRateLimited(mobileConnectionsPerIp, clientIp)) {
        logger.warn('WebSocket connection rejected: per-IP connection limit exceeded', {
          clientIp,
          activeConnectionsForIp: mobileConnectionsPerIp.get(clientIp) ?? 0,
          channel: 'mobile-host-stream',
          wsMaxConnectionsPerIp,
        });
        socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
        socket.destroy();
        return;
      }

      const authContext = authenticateMobileWsUpgrade(request);
      if (!authContext) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        trackUpgradedConnection(mobileConnectionsPerIp, clientIp, ws);
        wss.emit('connection', ws, request);
        logger.info('New mobile host-state WebSocket connection', {
          clientIp,
          subscriber: authContext.sub,
        });
        hostStateStreamBroker.handleConnection(ws, authContext);
      });
      return;
    }

    socket.destroy();
  });

  wss.on('error', (error) => {
    logger.error('WebSocket server error', { error });
  });

  logger.info('WebSocket server initialized');
  return wss;
}

function getClientIp(request: IncomingMessage): string {
  const forwardedFor = request.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim().length > 0) {
    return forwardedFor.split(',')[0].trim();
  }

  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    const first = forwardedFor[0]?.trim();
    if (first) {
      return first;
    }
  }

  return request.socket.remoteAddress || 'unknown';
}

export default createWebSocketServer;
