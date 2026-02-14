import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validateRequest } from '../validateRequest';
import { AppError } from '../errorHandler';

describe('validateRequest middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      body: {},
      params: {},
      query: {},
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockNext = jest.fn();
  });

  describe('body validation', () => {
    const schema = z.object({
      name: z.string(),
      email: z.string().email(),
      age: z.number().min(0).optional(),
    });

    it('should validate valid body data', () => {
      mockReq.body = {
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
      };

      const middleware = validateRequest(schema, 'body');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.body).toEqual({
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
      });
    });

    it('should throw AppError for missing required fields', () => {
      mockReq.body = {
        name: 'John Doe',
        // Missing email
      };

      const middleware = validateRequest(schema, 'body');

      expect(() => {
        middleware(mockReq as Request, mockRes as Response, mockNext);
      }).toThrow(AppError);

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should throw AppError with validation message for invalid data', () => {
      mockReq.body = {
        name: 'John Doe',
        email: 'invalid-email',
      };

      const middleware = validateRequest(schema, 'body');

      try {
        middleware(mockReq as Request, mockRes as Response, mockNext);
        fail('Should have thrown AppError');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).statusCode).toBe(400);
        expect((error as AppError).code).toBe('VALIDATION_ERROR');
        expect((error as AppError).message).toContain('email');
      }
    });

    it('should strip unknown fields', () => {
      mockReq.body = {
        name: 'John Doe',
        email: 'john@example.com',
        unknownField: 'should be removed',
      };

      const middleware = validateRequest(schema, 'body');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.body).not.toHaveProperty('unknownField');
      expect(mockReq.body).toEqual({
        name: 'John Doe',
        email: 'john@example.com',
      });
    });

    it('should return all validation errors when multiple fields are invalid', () => {
      mockReq.body = {
        // Missing both name and email
        age: -5, // Invalid age
      };

      const middleware = validateRequest(schema, 'body');

      try {
        middleware(mockReq as Request, mockRes as Response, mockNext);
        fail('Should have thrown AppError');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const message = (error as AppError).message;
        expect(message).toContain('name');
        expect(message).toContain('email');
        expect(message).toContain('age');
      }
    });
  });

  describe('params validation', () => {
    const schema = z.object({
      id: z.string().uuid(),
    });

    it('should validate params when target is params', () => {
      mockReq.params = {
        id: '123e4567-e89b-12d3-a456-426614174000',
      };

      const middleware = validateRequest(schema, 'params');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.params.id).toBe('123e4567-e89b-12d3-a456-426614174000');
    });

    it('should throw error for invalid params', () => {
      mockReq.params = {
        id: 'not-a-uuid',
      };

      const middleware = validateRequest(schema, 'params');

      expect(() => {
        middleware(mockReq as Request, mockRes as Response, mockNext);
      }).toThrow(AppError);
    });
  });

  describe('query validation', () => {
    const schema = z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(10),
    });

    it('should validate query parameters', () => {
      mockReq.query = {
        page: '2',
        limit: '20',
      };

      const middleware = validateRequest(schema, 'query');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      // Zod coerces string numbers to numbers
      expect(mockReq.query.page).toBe(2);
      expect(mockReq.query.limit).toBe(20);
    });

    it('should apply defaults for missing query parameters', () => {
      mockReq.query = {};

      const middleware = validateRequest(schema, 'query');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.query.page).toBe(1);
      expect(mockReq.query.limit).toBe(10);
    });
  });

  describe('default target', () => {
    it('should default to body validation when no target specified', () => {
      const schema = z.object({
        field: z.string(),
      });

      mockReq.body = { field: 'value' };

      const middleware = validateRequest(schema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });
});
