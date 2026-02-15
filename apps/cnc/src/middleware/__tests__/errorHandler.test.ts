import type { NextFunction, Request, Response } from 'express';
import { errorHandler } from '../errorHandler';
import logger from '../../utils/logger';

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
  },
}));

const mockedLogger = logger as jest.Mocked<typeof logger>;

describe('errorHandler middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { path: '/api/test', method: 'GET' };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  it('logs Error instances with stack and returns 500 payload', () => {
    const error = new Error('boom');

    errorHandler(error, req as Request, res as Response, next);

    expect(mockedLogger.error).toHaveBeenCalledWith('Unhandled error', {
      error: 'boom',
      stack: error.stack,
      path: '/api/test',
      method: 'GET',
    });
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  });

  it('handles non-Error values gracefully', () => {
    errorHandler('plain-failure', req as Request, res as Response, next);

    expect(mockedLogger.error).toHaveBeenCalledWith('Unhandled error', {
      error: 'Unknown error',
      stack: undefined,
      path: '/api/test',
      method: 'GET',
    });
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  });
});
