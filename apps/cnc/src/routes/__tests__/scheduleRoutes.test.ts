import express, { Express } from 'express';
import request from 'supertest';
import {
  wakeScheduleSchema,
  wakeScheduleListResponseSchema,
} from '@kaonis/woly-protocol';
import { createRoutes } from '../index';
import { NodeManager } from '../../services/nodeManager';
import { HostAggregator } from '../../services/hostAggregator';
import { CommandRouter } from '../../services/commandRouter';
import { createToken } from './testUtils';
import db from '../../database/connection';

jest.mock('../../config', () => ({
  __esModule: true,
  default: {
    jwtSecret: 'test-secret',
    jwtIssuer: 'test-issuer',
    jwtAudience: 'test-audience',
    port: 8080,
    dbType: 'sqlite',
    dbPath: ':memory:',
    nodeAuthTokens: ['test-node-token'],
    nodeHeartbeatInterval: 30000,
    nodeTimeout: 60000,
    jwtTtlSeconds: 3600,
  },
}));

describe('Schedule Routes', () => {
  let app: Express;
  const now = Math.floor(Date.now() / 1000);

  beforeAll(() => {
    const nodeManager = {} as unknown as NodeManager;
    const hostAggregator = {} as unknown as HostAggregator;
    const commandRouter = {} as unknown as CommandRouter;

    app = express();
    app.use(express.json());
    app.use('/api', createRoutes(nodeManager, hostAggregator, commandRouter));
  });

  beforeEach(async () => {
    await db.query('DELETE FROM wake_schedules');
  });

  const operatorToken = createToken({
    sub: 'mobile-user-a',
    role: 'operator',
    iss: 'test-issuer',
    aud: 'test-audience',
    exp: now + 3600,
    nbf: now - 10,
  });

  const secondOperatorToken = createToken({
    sub: 'mobile-user-b',
    role: 'operator',
    iss: 'test-issuer',
    aud: 'test-audience',
    exp: now + 3600,
    nbf: now - 10,
  });

  describe('GET /api/schedules', () => {
    it('returns 401 when JWT is missing', async () => {
      const response = await request(app).get('/api/schedules');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        code: 'AUTH_UNAUTHORIZED',
      });
    });

    it('returns 403 for viewer role', async () => {
      const viewerToken = createToken({
        sub: 'viewer-1',
        role: 'viewer',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now + 3600,
        nbf: now - 10,
      });

      const response = await request(app)
        .get('/api/schedules')
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        error: 'Forbidden',
        code: 'AUTH_FORBIDDEN',
      });
    });
  });

  describe('CRUD contract', () => {
    it('creates, lists, updates and deletes schedules with owner scoping', async () => {
      const createResponse = await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          hostName: 'office-pc',
          hostMac: 'AA:BB:CC:DD:EE:FF',
          hostFqn: 'office-pc@home-node',
          scheduledTime: '2026-02-16T08:00:00.000Z',
          frequency: 'daily',
          timezone: 'America/New_York',
          notifyOnWake: true,
        });

      expect(createResponse.status).toBe(201);
      expect(wakeScheduleSchema.safeParse(createResponse.body).success).toBe(true);
      const scheduleId = createResponse.body.id as string;

      await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${secondOperatorToken}`)
        .send({
          hostName: 'other-pc',
          hostMac: '11:22:33:44:55:66',
          hostFqn: 'other-pc@branch-node',
          scheduledTime: '2026-02-16T09:00:00.000Z',
          frequency: 'once',
          timezone: 'UTC',
        });

      const listResponse = await request(app)
        .get('/api/schedules')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(listResponse.status).toBe(200);
      expect(wakeScheduleListResponseSchema.safeParse(listResponse.body).success).toBe(true);
      expect(listResponse.body.schedules).toHaveLength(1);
      expect(listResponse.body.schedules[0].id).toBe(scheduleId);

      const updateResponse = await request(app)
        .put(`/api/schedules/${scheduleId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          enabled: false,
          frequency: 'weekdays',
          nextTrigger: '2026-02-17T13:00:00.000Z',
        });

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.enabled).toBe(false);
      expect(updateResponse.body.frequency).toBe('weekdays');

      const crossTenantUpdate = await request(app)
        .put(`/api/schedules/${scheduleId}`)
        .set('Authorization', `Bearer ${secondOperatorToken}`)
        .send({ enabled: true });
      expect(crossTenantUpdate.status).toBe(404);

      const deleteResponse = await request(app)
        .delete(`/api/schedules/${scheduleId}`)
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.body).toEqual({ success: true });

      const finalList = await request(app)
        .get('/api/schedules')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(finalList.status).toBe(200);
      expect(finalList.body.schedules).toHaveLength(0);
    });

    it('returns 400 for invalid request payloads', async () => {
      const response = await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          hostName: 'office-pc',
          hostMac: 'AA:BB:CC:DD:EE:FF',
          hostFqn: 'office-pc@home-node',
          scheduledTime: 'invalid-date',
          frequency: 'daily',
          timezone: 'Invalid/Timezone',
        });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: 'Bad Request',
      });
    });
  });
});
