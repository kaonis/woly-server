/**
 * Tests for HostsController.getMacVendor
 */

import type { Request, Response } from 'express';

// Mock the mac vendor service
jest.mock('../../services/macVendorService', () => ({
  lookupMacVendor: jest.fn(),
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

  it('should return 429 when rate limited', async () => {
    mockLookup.mockRejectedValueOnce(
      Object.assign(new Error('Rate limit exceeded, please try again later'), { statusCode: 429 }),
    );

    const req = { params: { mac: 'AA:BB:CC:DD:EE:FF' } } as unknown as Request;
    const res = createMockResponse();

    await controller.getMacVendor(req, res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Rate limit exceeded, please try again later',
      mac: 'AA:BB:CC:DD:EE:FF',
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
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to lookup MAC vendor' });
  });
});
