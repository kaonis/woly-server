import type { Request, Response } from 'express';
import type { HostWakeSchedule } from '@kaonis/woly-protocol';
import { SchedulesController } from '../schedules';
import HostScheduleModel from '../../models/HostSchedule';

jest.mock('../../models/HostSchedule', () => ({
  __esModule: true,
  default: {
    listByHostFqn: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function createMockRequest(options?: {
  params?: Record<string, string>;
  body?: Record<string, unknown>;
}): Request {
  return {
    params: options?.params ?? {},
    body: options?.body ?? {},
  } as unknown as Request;
}

function sampleSchedule(overrides: Partial<HostWakeSchedule> = {}): HostWakeSchedule {
  return {
    id: 'schedule-1',
    hostFqn: 'office@home',
    hostName: 'office',
    hostMac: 'AA:BB:CC:DD:EE:FF',
    scheduledTime: '2026-02-20T10:00:00.000Z',
    frequency: 'daily',
    enabled: true,
    notifyOnWake: true,
    timezone: 'UTC',
    createdAt: '2026-02-18T00:00:00.000Z',
    updatedAt: '2026-02-18T00:00:00.000Z',
    ...overrides,
  };
}

describe('SchedulesController', () => {
  const mockedHostScheduleModel = HostScheduleModel as jest.Mocked<typeof HostScheduleModel>;

  let hostAggregator: {
    getHostByFQN: jest.Mock;
  };
  let controller: SchedulesController;

  beforeEach(() => {
    jest.clearAllMocks();
    hostAggregator = {
      getHostByFQN: jest.fn(),
    };
    controller = new SchedulesController(hostAggregator as unknown as never);
  });

  describe('listHostSchedules', () => {
    it('returns 404 when host is not found', async () => {
      hostAggregator.getHostByFQN.mockResolvedValue(null);
      const req = createMockRequest({ params: { fqn: 'missing@home' } });
      const res = createMockResponse();

      await controller.listHostSchedules(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Not Found',
        message: 'Host missing@home not found',
      });
      expect(mockedHostScheduleModel.listByHostFqn).not.toHaveBeenCalled();
    });

    it('returns schedules for an existing host', async () => {
      hostAggregator.getHostByFQN.mockResolvedValue({ name: 'office', mac: 'AA:BB:CC:DD:EE:FF' });
      mockedHostScheduleModel.listByHostFqn.mockResolvedValue([sampleSchedule()]);
      const req = createMockRequest({ params: { fqn: 'office@home' } });
      const res = createMockResponse();

      await controller.listHostSchedules(req, res);

      expect(mockedHostScheduleModel.listByHostFqn).toHaveBeenCalledWith('office@home');
      expect(res.json).toHaveBeenCalledWith({
        schedules: [sampleSchedule()],
      });
    });

    it('returns 500 when listing schedules fails', async () => {
      hostAggregator.getHostByFQN.mockResolvedValue({ name: 'office', mac: 'AA:BB:CC:DD:EE:FF' });
      mockedHostScheduleModel.listByHostFqn.mockRejectedValue(new Error('db failure'));
      const req = createMockRequest({ params: { fqn: 'office@home' } });
      const res = createMockResponse();

      await controller.listHostSchedules(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Failed to list host schedules',
      });
    });
  });

  describe('createHostSchedule', () => {
    it('returns 404 when host is not found', async () => {
      hostAggregator.getHostByFQN.mockResolvedValue(null);
      const req = createMockRequest({
        params: { fqn: 'missing@home' },
        body: { scheduledTime: '2026-02-20T10:00:00.000Z', frequency: 'daily' },
      });
      const res = createMockResponse();

      await controller.createHostSchedule(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Not Found',
        message: 'Host missing@home not found',
      });
      expect(mockedHostScheduleModel.create).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid request payload', async () => {
      hostAggregator.getHostByFQN.mockResolvedValue({ name: 'office', mac: 'AA:BB:CC:DD:EE:FF' });
      const req = createMockRequest({
        params: { fqn: 'office@home' },
        body: { scheduledTime: 'not-a-time', frequency: 'hourly' },
      });
      const res = createMockResponse();

      await controller.createHostSchedule(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Bad Request',
          message: 'Invalid request body',
        }),
      );
      expect(mockedHostScheduleModel.create).not.toHaveBeenCalled();
    });

    it('creates a schedule with protocol defaults for optional fields', async () => {
      hostAggregator.getHostByFQN.mockResolvedValue({ name: 'office', mac: 'AA:BB:CC:DD:EE:FF' });
      mockedHostScheduleModel.create.mockResolvedValue(sampleSchedule());
      const req = createMockRequest({
        params: { fqn: 'office@home' },
        body: {
          scheduledTime: '2026-02-20T10:00:00.000Z',
          frequency: 'daily',
        },
      });
      const res = createMockResponse();

      await controller.createHostSchedule(req, res);

      expect(mockedHostScheduleModel.create).toHaveBeenCalledWith({
        hostFqn: 'office@home',
        hostName: 'office',
        hostMac: 'AA:BB:CC:DD:EE:FF',
        scheduledTime: '2026-02-20T10:00:00.000Z',
        frequency: 'daily',
        enabled: true,
        notifyOnWake: true,
        timezone: 'UTC',
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(sampleSchedule());
    });
  });

  describe('updateSchedule', () => {
    it('returns 400 for invalid request payload', async () => {
      const req = createMockRequest({
        params: { id: 'schedule-1' },
        body: { frequency: 'invalid' },
      });
      const res = createMockResponse();

      await controller.updateSchedule(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Bad Request',
          message: 'Invalid request body',
        }),
      );
      expect(mockedHostScheduleModel.update).not.toHaveBeenCalled();
    });

    it('returns 404 when schedule does not exist', async () => {
      mockedHostScheduleModel.update.mockResolvedValue(null);
      const req = createMockRequest({
        params: { id: 'missing-id' },
        body: { enabled: false },
      });
      const res = createMockResponse();

      await controller.updateSchedule(req, res);

      expect(mockedHostScheduleModel.update).toHaveBeenCalledWith('missing-id', { enabled: false });
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Not Found',
        message: 'Schedule missing-id not found',
      });
    });

    it('returns updated schedule when update succeeds', async () => {
      mockedHostScheduleModel.update.mockResolvedValue(sampleSchedule({ enabled: false }));
      const req = createMockRequest({
        params: { id: 'schedule-1' },
        body: { enabled: false },
      });
      const res = createMockResponse();

      await controller.updateSchedule(req, res);

      expect(res.json).toHaveBeenCalledWith(sampleSchedule({ enabled: false }));
    });

    it('returns 500 when update throws', async () => {
      mockedHostScheduleModel.update.mockRejectedValue(new Error('update failure'));
      const req = createMockRequest({
        params: { id: 'schedule-1' },
        body: { enabled: false },
      });
      const res = createMockResponse();

      await controller.updateSchedule(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Failed to update schedule',
      });
    });
  });

  describe('deleteSchedule', () => {
    it('returns 404 when schedule does not exist', async () => {
      mockedHostScheduleModel.delete.mockResolvedValue(false);
      const req = createMockRequest({ params: { id: 'missing-id' } });
      const res = createMockResponse();

      await controller.deleteSchedule(req, res);

      expect(mockedHostScheduleModel.delete).toHaveBeenCalledWith('missing-id');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Not Found',
        message: 'Schedule missing-id not found',
      });
    });

    it('returns success response when delete succeeds', async () => {
      mockedHostScheduleModel.delete.mockResolvedValue(true);
      const req = createMockRequest({ params: { id: 'schedule-1' } });
      const res = createMockResponse();

      await controller.deleteSchedule(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true, id: 'schedule-1' });
    });

    it('returns 500 when delete throws', async () => {
      mockedHostScheduleModel.delete.mockRejectedValue(new Error('delete failure'));
      const req = createMockRequest({ params: { id: 'schedule-1' } });
      const res = createMockResponse();

      await controller.deleteSchedule(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Failed to delete schedule',
      });
    });
  });
});
