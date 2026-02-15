import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { AppError } from './errorHandler';

/**
 * Validation target - where to find the data to validate
 */
export type ValidationTarget = 'body' | 'params' | 'query';

/**
 * Creates a middleware that validates request data against a Zod schema
 *
 * @param schema - Zod schema to validate against
 * @param target - Which part of the request to validate (body, params, or query)
 * @returns Express middleware function
 */
export const validateRequest = (schema: z.ZodTypeAny, target: ValidationTarget = 'body') => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const dataToValidate = req[target];

    try {
      // Parse and validate data with Zod
      const value = schema.parse(dataToValidate);

      // Replace request data with validated and sanitized data
      req[target] = value;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Format errors to match Joi format: comma-separated error messages with field paths
        const errorMessage = error.issues
          .map((err) => {
            const path = err.path.length > 0 ? `"${err.path.join('.')}" ` : '';
            return `${path}${err.message}`;
          })
          .join(', ');
        throw new AppError(errorMessage, 400, 'VALIDATION_ERROR');
      }
      throw error;
    }
  };
};
