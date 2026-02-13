/**
 * Tests for HostsController.getMacVendor
 */

import type { Request, Response } from 'express';

// Mock the mac vendor service
jest.mock('../../services/macVendorService', () => ({
  lookupMacVendor: jest.fn(),
  MAC_ADDRESS_PATTERN: /^([0-9A-Fa-f]{2}([-:])){5}[0-9A-Fa-f]{2}$|^[0-9A-Fa-f]{12}$/,
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { lookupMacVendor } from '../../services/macVendorService';
import { HostsController } from '../hosts';

const mockLookup = lookupMacVendor as jest.MockedFunction<typeof lookupMacVendor>;

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('HostsController.getMacVendor', () => {
  let controller: HostsController;

  beforeEach(() => {
    jest.clearAllMocks();
    // HostAggregator and CommandRouter are not used by getMacVendor
    controller = new HostsController(null as any, null as any);
  });

  it('should return vendor info for a valid MAC', async () => {
    mockLookup.mockResolvedValueOnce({
      mac: '80:6D:97:60:39:08',
      vendor: 'Apple, Inc.',
      source: 'macvendors.com',
    });

    const req = { params: { mac: '80:6D:97:60:39:08' } } as unknown as Request;
    const res = createMockResponse();

    await controller.getMacVendor(req, res);

    expect(res.json).toHaveBeenCalledWith({
      mac: '80:6D:97:60:39:08',
      vendor: 'Apple, Inc.',
      source: 'macvendors.com',
    });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 400 when MAC is missing', async () => {
    const req = { params: {} } as unknown as Request;
    const res = createMockResponse();

    await controller.getMacVendor(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'MAC address is required' });
  });

  it('should return 400 when MAC format is invalid', async () => {
    const req = { params: { mac: 'invalid-mac' } } as unknown as Request;
    const res = createMockResponse();

    await controller.getMacVendor(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid MAC address format' });
  });

  it('should return 429 when rate limited', async () => {
    mockLookup.mockRejectedValueOnce(
      Object.assign(new Error('Rate limit exceeded, please try again later'), { statusCode: 429 }),
    );

    const req = { params: { mac: 'AA:BB:CC:DD:EE:FF' } } as unknown as Request;
    const res = createMockResponse();

    await controller.getMacVendor(req, res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded, please try again later',
    });
  });

  it('should return 500 on unexpected errors', async () => {
    mockLookup.mockRejectedValueOnce(
      Object.assign(new Error('Failed to lookup MAC vendor'), { statusCode: 500 }),
    );

    const req = { params: { mac: 'AA:BB:CC:DD:EE:FF' } } as unknown as Request;
    const res = createMockResponse();

    await controller.getMacVendor(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Internal Server Error',
      message: 'Failed to lookup MAC vendor',
    });
  });
});

describe('HostsController.updateHost', () => {
  let controller: HostsController;
  let mockCommandRouter: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock CommandRouter
    mockCommandRouter = {
      routeUpdateHostCommand: jest.fn(),
    };
    
    // HostAggregator is not used by updateHost
    controller = new HostsController(null as any, mockCommandRouter);
  });

  function createMockRequest(body: any, fqn: string = 'testhost@location', headers?: any): Request {
    const req = {
      params: { fqn },
      body,
      header: jest.fn((name: string) => headers?.[name]),
    } as unknown as Request;
    return req;
  }

  describe('valid requests', () => {
    it('should accept valid update with all fields', async () => {
      mockCommandRouter.routeUpdateHostCommand.mockResolvedValueOnce({ success: true });

      const req = createMockRequest({
        name: 'newname',
        mac: 'AA:BB:CC:DD:EE:FF',
        ip: '192.168.1.100',
        status: 'awake',
      });
      const res = createMockResponse();

      await controller.updateHost(req, res);

      expect(mockCommandRouter.routeUpdateHostCommand).toHaveBeenCalledWith(
        'testhost@location',
        {
          name: 'newname',
          mac: 'AA:BB:CC:DD:EE:FF',
          ip: '192.168.1.100',
          status: 'awake',
        },
        { idempotencyKey: null }
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Host updated successfully',
      });
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should accept valid update with partial fields (name only)', async () => {
      mockCommandRouter.routeUpdateHostCommand.mockResolvedValueOnce({ success: true });

      const req = createMockRequest({ name: 'updatedname' });
      const res = createMockResponse();

      await controller.updateHost(req, res);

      expect(mockCommandRouter.routeUpdateHostCommand).toHaveBeenCalledWith(
        'testhost@location',
        { name: 'updatedname' },
        { idempotencyKey: null }
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Host updated successfully',
      });
    });

    it('should accept valid update with partial fields (mac only)', async () => {
      mockCommandRouter.routeUpdateHostCommand.mockResolvedValueOnce({ success: true });

      const req = createMockRequest({ mac: '11:22:33:44:55:66' });
      const res = createMockResponse();

      await controller.updateHost(req, res);

      expect(mockCommandRouter.routeUpdateHostCommand).toHaveBeenCalledWith(
        'testhost@location',
        { mac: '11:22:33:44:55:66' },
        { idempotencyKey: null }
      );
    });

    it('should accept valid update with partial fields (ip only)', async () => {
      mockCommandRouter.routeUpdateHostCommand.mockResolvedValueOnce({ success: true });

      const req = createMockRequest({ ip: '10.0.0.5' });
      const res = createMockResponse();

      await controller.updateHost(req, res);

      expect(mockCommandRouter.routeUpdateHostCommand).toHaveBeenCalledWith(
        'testhost@location',
        { ip: '10.0.0.5' },
        { idempotencyKey: null }
      );
    });

    it('should accept valid update with status asleep', async () => {
      mockCommandRouter.routeUpdateHostCommand.mockResolvedValueOnce({ success: true });

      const req = createMockRequest({ status: 'asleep' });
      const res = createMockResponse();

      await controller.updateHost(req, res);

      expect(mockCommandRouter.routeUpdateHostCommand).toHaveBeenCalledWith(
        'testhost@location',
        { status: 'asleep' },
        { idempotencyKey: null }
      );
    });

    it('should accept empty body (all fields optional)', async () => {
      mockCommandRouter.routeUpdateHostCommand.mockResolvedValueOnce({ success: true });

      const req = createMockRequest({});
      const res = createMockResponse();

      await controller.updateHost(req, res);

      expect(mockCommandRouter.routeUpdateHostCommand).toHaveBeenCalledWith(
        'testhost@location',
        {},
        { idempotencyKey: null }
      );
    });

    it('should accept IPv6 addresses', async () => {
      mockCommandRouter.routeUpdateHostCommand.mockResolvedValueOnce({ success: true });

      const req = createMockRequest({ ip: '2001:0db8:85a3:0000:0000:8a2e:0370:7334' });
      const res = createMockResponse();

      await controller.updateHost(req, res);

      expect(mockCommandRouter.routeUpdateHostCommand).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Host updated successfully',
      });
    });
  });

  describe('validation errors', () => {
    it('should reject empty name string', async () => {
      const req = createMockRequest({ name: '' });
      const res = createMockResponse();

      await controller.updateHost(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Bad Request',
          message: 'Invalid request body',
          details: expect.any(Array),
        })
      );
      expect(mockCommandRouter.routeUpdateHostCommand).not.toHaveBeenCalled();
    });

    it('should reject invalid MAC address format (missing colons)', async () => {
      const req = createMockRequest({ mac: 'AABBCCDDEE' });  // Too short
      const res = createMockResponse();

      await controller.updateHost(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Bad Request',
          message: 'Invalid request body',
        })
      );
      expect(mockCommandRouter.routeUpdateHostCommand).not.toHaveBeenCalled();
    });

    it('should accept valid MAC address format (dashes instead of colons)', async () => {
      mockCommandRouter.routeUpdateHostCommand.mockResolvedValueOnce({ success: true });

      const req = createMockRequest({ mac: 'AA-BB-CC-DD-EE-FF' });
      const res = createMockResponse();

      await controller.updateHost(req, res);

      expect(mockCommandRouter.routeUpdateHostCommand).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Host updated successfully',
      });
    });

    it('should accept valid MAC address format (no separators)', async () => {
      mockCommandRouter.routeUpdateHostCommand.mockResolvedValueOnce({ success: true });

      const req = createMockRequest({ mac: 'AABBCCDDEEFF' });
      const res = createMockResponse();

      await controller.updateHost(req, res);

      expect(mockCommandRouter.routeUpdateHostCommand).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Host updated successfully',
      });
    });

    it('should reject invalid MAC address format (too short)', async () => {
      const req = createMockRequest({ mac: 'AA:BB:CC' });
      const res = createMockResponse();

      await controller.updateHost(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockCommandRouter.routeUpdateHostCommand).not.toHaveBeenCalled();
    });

    it('should reject invalid IP address', async () => {
      const req = createMockRequest({ ip: '999.999.999.999' });
      const res = createMockResponse();

      await controller.updateHost(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Bad Request',
          message: 'Invalid request body',
        })
      );
      expect(mockCommandRouter.routeUpdateHostCommand).not.toHaveBeenCalled();
    });

    it('should reject invalid IP address (not an IP)', async () => {
      const req = createMockRequest({ ip: 'not-an-ip' });
      const res = createMockResponse();

      await controller.updateHost(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockCommandRouter.routeUpdateHostCommand).not.toHaveBeenCalled();
    });

    it('should reject invalid status value', async () => {
      const req = createMockRequest({ status: 'invalid-status' });
      const res = createMockResponse();

      await controller.updateHost(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Bad Request',
          message: 'Invalid request body',
        })
      );
      expect(mockCommandRouter.routeUpdateHostCommand).not.toHaveBeenCalled();
    });

    it('should reject extra/unexpected fields (strict mode)', async () => {
      const req = createMockRequest({
        name: 'validname',
        unexpectedField: 'should-be-rejected',
      });
      const res = createMockResponse();

      await controller.updateHost(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Bad Request',
          message: 'Invalid request body',
        })
      );
      expect(mockCommandRouter.routeUpdateHostCommand).not.toHaveBeenCalled();
    });

    it('should reject invalid field types (number instead of string)', async () => {
      const req = createMockRequest({ name: 123 });
      const res = createMockResponse();

      await controller.updateHost(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockCommandRouter.routeUpdateHostCommand).not.toHaveBeenCalled();
    });

    it('should reject invalid field types (array)', async () => {
      const req = createMockRequest({ mac: ['AA:BB:CC:DD:EE:FF'] });
      const res = createMockResponse();

      await controller.updateHost(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockCommandRouter.routeUpdateHostCommand).not.toHaveBeenCalled();
    });
  });

  describe('command routing errors', () => {
    it('should return 500 when command routing fails', async () => {
      mockCommandRouter.routeUpdateHostCommand.mockResolvedValueOnce({
        success: false,
        error: 'Command execution failed',
      });

      const req = createMockRequest({ name: 'newname' });
      const res = createMockResponse();

      await controller.updateHost(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Command execution failed',
      });
    });

    it('should return 404 when host not found', async () => {
      mockCommandRouter.routeUpdateHostCommand.mockRejectedValueOnce(
        new Error('Host not found: testhost@location')
      );

      const req = createMockRequest({ name: 'newname' });
      const res = createMockResponse();

      await controller.updateHost(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Service Unavailable',
        message: 'Host not found: testhost@location',
      });
    });

    it('should return 503 when node is offline', async () => {
      mockCommandRouter.routeUpdateHostCommand.mockRejectedValueOnce(
        new Error('Node node1 is offline')
      );

      const req = createMockRequest({ name: 'newname' });
      const res = createMockResponse();

      await controller.updateHost(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Service Unavailable',
        message: 'Node node1 is offline',
      });
    });

    it('should return 504 when command times out', async () => {
      mockCommandRouter.routeUpdateHostCommand.mockRejectedValueOnce(
        new Error('Command timeout after 30000ms')
      );

      const req = createMockRequest({ name: 'newname' });
      const res = createMockResponse();

      await controller.updateHost(req, res);

      expect(res.status).toHaveBeenCalledWith(504);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Service Unavailable',
        message: 'Command timeout after 30000ms',
      });
    });
  });
});

