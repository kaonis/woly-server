import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { AppError } from './errorHandler';

/**
 * Validation target - where to find the data to validate
 */
export type ValidationTarget = 'body' | 'params' | 'query';

/**
 * Creates a middleware that validates request data against a Joi schema
 * 
 * @param schema - Joi schema to validate against
 * @param target - Which part of the request to validate (body, params, or query)
 * @returns Express middleware function
 */
export const validateRequest = (
  schema: Joi.ObjectSchema,
  target: ValidationTarget = 'body'
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const dataToValidate = req[target];

    const { error, value } = schema.validate(dataToValidate, {
      abortEarly: false, // Return all errors, not just the first one
      stripUnknown: true // Remove unknown fields
    });

    if (error) {
      const errorMessage = error.details
        .map(detail => detail.message)
        .join(', ');

      throw new AppError(errorMessage, 400, 'VALIDATION_ERROR');
    }

    // Replace request data with validated and sanitized data
    req[target] = value;
    next();
  };
};
