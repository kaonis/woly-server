/**
 * WebSocket server for node communication
 */

import WebSocket from 'ws';
import { Server as HTTPServer } from 'http';
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

  // Handle upgrade requests
  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = request.url?.split('?')[0];

    if (pathname === '/ws/node') {
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
        // Emit the standard connection event for any listeners, but handle node auth here
        // so we can keep authContext strongly typed without relying on extra event args.
        wss.emit('connection', ws, request);
        logger.info('New WebSocket connection attempt');
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

export default createWebSocketServer;
