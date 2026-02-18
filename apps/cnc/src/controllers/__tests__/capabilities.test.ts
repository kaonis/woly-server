import type { Request, Response } from 'express';
import { SUPPORTED_PROTOCOL_VERSIONS } from '@kaonis/woly-protocol';
import { buildCncCapabilitiesResponse, CapabilitiesController } from '../capabilities';
import logger from '../../utils/logger';

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

describe('CapabilitiesController', () => {
  const mockedLogger = logger as jest.Mocked<typeof logger>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds a valid capabilities response with explicit versions', () => {
    const response = buildCncCapabilitiesResponse({
      cncApi: '1.2.3',
      protocol: '2.0.0',
    });

    expect(response.mode).toBe('cnc');
    expect(response.versions).toEqual({
      cncApi: '1.2.3',
      protocol: '2.0.0',
    });
    expect(response.capabilities.schedules.routes).toEqual(['/api/schedules', '/api/schedules/:id']);
    expect(response.capabilities.hostStateStreaming).toEqual({
      supported: true,
      transport: 'websocket',
      routes: ['/ws/mobile/hosts'],
      note: expect.any(String),
    });
  });

  it('falls back and logs warnings when versions are invalid', () => {
    const fallbackProtocol = Array.isArray(SUPPORTED_PROTOCOL_VERSIONS)
      ? (SUPPORTED_PROTOCOL_VERSIONS.find((version) => typeof version === 'string' && version.trim()) ?? '1.0.0')
      : '1.0.0';
    const response = buildCncCapabilitiesResponse({
      cncApi: '   ',
      protocol: 7,
    });

    expect(response.versions.cncApi).toBe('0.0.0');
    expect(response.versions.protocol).toBe(fallbackProtocol);
    expect(mockedLogger.warn).toHaveBeenCalledTimes(2);
  });

  it('returns a 200 capabilities payload for successful requests', async () => {
    const controller = new CapabilitiesController();
    const req = {} as Request;
    const res = createMockResponse();

    await controller.getCapabilities(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(buildCncCapabilitiesResponse());
  });

  it('returns a 500 response with correlation id when serialization fails', async () => {
    const controller = new CapabilitiesController();
    const finalJson = jest.fn();
    const res = {
      status: jest.fn((code: number) => {
        if (code === 200) {
          return {
            json: () => {
              throw new Error('serialization failed');
            },
          };
        }
        return {
          json: finalJson,
        };
      }),
    } as unknown as Response;
    const req = {
      correlationId: 'corr-capability-failure',
    } as Request;

    await controller.getCapabilities(req, res);

    expect(mockedLogger.error).toHaveBeenCalledWith(
      'Failed to get capabilities',
      expect.objectContaining({
        correlationId: 'corr-capability-failure',
        error: 'serialization failed',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(500);
    expect(finalJson).toHaveBeenCalledWith({
      error: 'Internal Server Error',
      message: 'Failed to retrieve capabilities',
      correlationId: 'corr-capability-failure',
    });
  });

  it('returns a 500 response without correlation id for non-Error failures', async () => {
    const controller = new CapabilitiesController();
    const finalJson = jest.fn();
    const res = {
      status: jest.fn((code: number) => {
        if (code === 200) {
          return {
            json: () => {
              throw 'string-failure';
            },
          };
        }
        return {
          json: finalJson,
        };
      }),
    } as unknown as Response;
    const req = {} as Request;

    await controller.getCapabilities(req, res);

    expect(mockedLogger.error).toHaveBeenCalledWith(
      'Failed to get capabilities',
      expect.objectContaining({
        correlationId: undefined,
        error: 'string-failure',
      }),
    );
    expect(finalJson).toHaveBeenCalledWith({
      error: 'Internal Server Error',
      message: 'Failed to retrieve capabilities',
    });
  });
});
