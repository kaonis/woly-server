/**
 * WebSocket server for node communication
 */

import WebSocket from 'ws';
import { IncomingMessage, Server as HTTPServer } from 'http';
import { NodeManager } from '../services/nodeManager';
import config from '../config';
import logger from '../utils/logger';
import { isRequestTls } from './auth';
import { authenticateWsUpgrade } from './upgradeAuth';

export function createWebSocketServer(
  httpServer: HTTPServer,
  nodeManager: NodeManager
): WebSocket.Server {
  const wss = new WebSocket.Server({ noServer: true, maxPayload: 256 * 1024 });
  const wsMaxConnectionsPerIp = Math.max(config.wsMaxConnectionsPerIp, 1);
  const connectionsPerIp = new Map<string, number>();

  const decrementConnectionCount = (ip: string): void => {
    const count = connectionsPerIp.get(ip);
    if (!count) {
      return;
    }

    if (count <= 1) {
      connectionsPerIp.delete(ip);
      return;
    }

    connectionsPerIp.set(ip, count - 1);
  };

  // Handle upgrade requests
  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = request.url?.split('?')[0];

    if (pathname === '/ws/node') {
      const clientIp = getClientIp(request);
      const activeConnectionsForIp = connectionsPerIp.get(clientIp) ?? 0;
      if (activeConnectionsForIp >= wsMaxConnectionsPerIp) {
        logger.warn('WebSocket connection rejected: per-IP connection limit exceeded', {
          clientIp,
          activeConnectionsForIp,
          wsMaxConnectionsPerIp,
        });
        socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
        socket.destroy();
        return;
      }

      if (config.wsRequireTls && !isRequestTls(request)) {
        socket.write('HTTP/1.1 426 Upgrade Required\r\n\r\n');
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
        connectionsPerIp.set(clientIp, activeConnectionsForIp + 1);
        ws.once('close', () => {
          decrementConnectionCount(clientIp);
        });

        // Emit the standard connection event for any listeners, but handle node auth here
        // so we can keep authContext strongly typed without relying on extra event args.
        wss.emit('connection', ws, request);
        logger.info('New WebSocket connection attempt', { clientIp });
        void nodeManager.handleConnection(ws, authContext);
      });
    } else {
      socket.destroy();
    }
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
