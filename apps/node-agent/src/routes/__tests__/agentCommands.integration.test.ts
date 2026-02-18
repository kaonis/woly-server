import express from 'express';
import request from 'supertest';
import agentCommandsRouter from '../agentCommands';
import { errorHandler, notFoundHandler } from '../../middleware/errorHandler';
import { agentConfig } from '../../config/agent';

const dispatchTunnelCommand = jest.fn();

jest.mock('../../config/agent', () => ({
  agentConfig: {
    mode: 'agent',
    authToken: 'dev-token-home',
    nodeId: 'node-1',
  },
}));

jest.mock('../../services/agentService', () => ({
  agentService: {
    dispatchTunnelCommand: (...args: unknown[]) => dispatchTunnelCommand(...args),
  },
}));

function createApp(): express.Application {
  const app = express();
  app.use(express.json());
  app.use('/agent', agentCommandsRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe('agent tunnel command routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = createApp();
    dispatchTunnelCommand.mockReset();
    (agentConfig as { mode: string }).mode = 'agent';
  });

  it('rejects requests without Authorization header', async () => {
    const response = await request(app)
      .post('/agent/commands')
      .send({
        type: 'wake',
        commandId: 'cmd-1',
        data: { hostName: 'desktop', mac: 'AA:BB:CC:DD:EE:FF' },
      })
      .expect(401);

    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects malformed command payloads', async () => {
    const response = await request(app)
      .post('/agent/commands')
      .set('Authorization', `Bearer ${(agentConfig as { authToken: string }).authToken}`)
      .send({
        type: 'wake',
        data: { hostName: 'desktop', mac: 'AA:BB:CC:DD:EE:FF' },
      })
      .expect(400);

    expect(response.body.error.code).toBe('BAD_REQUEST');
  });

  it('dispatches command and returns canonical command-result payload', async () => {
    dispatchTunnelCommand.mockResolvedValue({
      success: true,
      message: 'Wake-on-LAN packet sent',
    });

    const response = await request(app)
      .post('/agent/commands')
      .set('Authorization', `Bearer ${(agentConfig as { authToken: string }).authToken}`)
      .send({
        type: 'wake',
        commandId: 'cmd-1',
        data: { hostName: 'desktop', mac: 'AA:BB:CC:DD:EE:FF' },
      })
      .expect(200);

    expect(dispatchTunnelCommand).toHaveBeenCalledWith({
      type: 'wake',
      commandId: 'cmd-1',
      data: { hostName: 'desktop', mac: 'AA:BB:CC:DD:EE:FF' },
    });
    expect(response.body.type).toBe('command-result');
    expect(response.body.data).toMatchObject({
      nodeId: 'node-1',
      commandId: 'cmd-1',
      success: true,
      message: 'Wake-on-LAN packet sent',
    });
    expect(typeof response.body.data.timestamp).toBe('string');
  });

  it('rejects tunnel dispatch when node-agent is not in agent mode', async () => {
    (agentConfig as { mode: string }).mode = 'standalone';

    await request(app)
      .post('/agent/commands')
      .set('Authorization', `Bearer ${(agentConfig as { authToken: string }).authToken}`)
      .send({
        type: 'wake',
        commandId: 'cmd-1',
        data: { hostName: 'desktop', mac: 'AA:BB:CC:DD:EE:FF' },
      })
      .expect(409);
  });
});
