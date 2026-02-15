import { NextFunction, Request, Response } from 'express';
import { assignCorrelationId } from '../correlationId';

describe('assignCorrelationId middleware', () => {
  const next = jest.fn() as NextFunction;

  function createMockResponse(): Response {
    const res = {} as Response;
    res.setHeader = jest.fn();
    return res;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses incoming x-correlation-id header when provided', () => {
    const req = {
      header: jest.fn().mockImplementation((name: string) =>
        name.toLowerCase() === 'x-correlation-id' ? 'corr-client-123' : undefined
      ),
    } as unknown as Request;
    const res = createMockResponse();

    assignCorrelationId(req, res, next);

    expect(req.correlationId).toBe('corr-client-123');
    expect(res.setHeader).toHaveBeenCalledWith('X-Correlation-Id', 'corr-client-123');
    expect(next).toHaveBeenCalled();
  });

  it('generates correlation id when header is missing', () => {
    const req = {
      header: jest.fn().mockReturnValue(undefined),
    } as unknown as Request;
    const res = createMockResponse();

    assignCorrelationId(req, res, next);

    expect(req.correlationId).toMatch(/^corr_/);
    expect(res.setHeader).toHaveBeenCalledWith('X-Correlation-Id', req.correlationId);
  });
});
