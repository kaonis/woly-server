import { Request, Response } from 'express';
import {
  createWakeScheduleRequestSchema,
  updateWakeScheduleRequestSchema,
  wakeScheduleListResponseSchema,
  wakeScheduleSchema,
} from '@kaonis/woly-protocol';
import { z } from 'zod';
import { WakeScheduleModel } from '../models/WakeSchedule';
import logger from '../utils/logger';

const listSchedulesQuerySchema = z.object({
  hostFqn: z.string().min(1).optional(),
});

function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function badRequest(res: Response, message: string, details?: unknown): void {
  res.status(400).json({
    error: 'Bad Request',
    message,
    ...(details ? { details } : {}),
  });
}

function ownerSub(req: Request): string | null {
  return req.auth?.sub ?? null;
}

export class SchedulesController {
  /**
   * @swagger
   * /api/schedules:
   *   get:
   *     summary: List wake schedules for authenticated subject
   *     description: Returns wake schedules scoped to the authenticated JWT subject with optional host FQN filter.
   *     tags: [Schedules]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: hostFqn
   *         schema:
   *           type: string
   *         description: Optional fully-qualified host identity filter (hostname@location)
   *         example: office-pc@home-node
   *     responses:
   *       200:
   *         description: Wake schedules list
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 schedules:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/WakeSchedule'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async listSchedules(req: Request, res: Response): Promise<void> {
    try {
      const authSub = ownerSub(req);
      if (!authSub) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
          code: 'AUTH_UNAUTHORIZED',
        });
        return;
      }

      const queryParse = listSchedulesQuerySchema.safeParse(req.query);
      if (!queryParse.success) {
        badRequest(res, 'Invalid query parameters', queryParse.error.issues);
        return;
      }

      const schedules = await WakeScheduleModel.list(authSub, queryParse.data.hostFqn);
      const payload = wakeScheduleListResponseSchema.parse({ schedules });
      res.status(200).json(payload);
    } catch (error) {
      logger.error('Failed to list wake schedules', {
        ownerSub: req.auth?.sub,
        correlationId: req.correlationId,
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve wake schedules',
      });
    }
  }

  /**
   * @swagger
   * /api/schedules:
   *   post:
   *     summary: Create wake schedule
   *     description: Creates a wake schedule scoped to the authenticated JWT subject.
   *     tags: [Schedules]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/CreateWakeScheduleRequest'
   *     responses:
   *       201:
   *         description: Created wake schedule
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/WakeSchedule'
   *       400:
   *         $ref: '#/components/responses/BadRequest'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async createSchedule(req: Request, res: Response): Promise<void> {
    try {
      const authSub = ownerSub(req);
      if (!authSub) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
          code: 'AUTH_UNAUTHORIZED',
        });
        return;
      }

      const parseResult = createWakeScheduleRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        badRequest(res, 'Invalid request body', parseResult.error.issues);
        return;
      }

      if (!isValidTimezone(parseResult.data.timezone)) {
        badRequest(res, 'timezone must be a valid IANA timezone name');
        return;
      }

      const created = await WakeScheduleModel.create(authSub, parseResult.data);
      const payload = wakeScheduleSchema.parse(created);
      res.status(201).json(payload);
    } catch (error) {
      logger.error('Failed to create wake schedule', {
        ownerSub: req.auth?.sub,
        correlationId: req.correlationId,
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to create wake schedule',
      });
    }
  }

  /**
   * @swagger
   * /api/schedules/{id}:
   *   put:
   *     summary: Update wake schedule
   *     description: Updates a wake schedule owned by the authenticated JWT subject.
   *     tags: [Schedules]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Wake schedule ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/UpdateWakeScheduleRequest'
   *     responses:
   *       200:
   *         description: Updated wake schedule
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/WakeSchedule'
   *       400:
   *         $ref: '#/components/responses/BadRequest'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async updateSchedule(req: Request, res: Response): Promise<void> {
    try {
      const authSub = ownerSub(req);
      if (!authSub) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
          code: 'AUTH_UNAUTHORIZED',
        });
        return;
      }

      const scheduleId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
      if (!scheduleId) {
        badRequest(res, 'Schedule id is required');
        return;
      }

      const parseResult = updateWakeScheduleRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        badRequest(res, 'Invalid request body', parseResult.error.issues);
        return;
      }

      if (
        parseResult.data.timezone !== undefined &&
        !isValidTimezone(parseResult.data.timezone)
      ) {
        badRequest(res, 'timezone must be a valid IANA timezone name');
        return;
      }

      const updated = await WakeScheduleModel.update(authSub, scheduleId, parseResult.data);
      if (!updated) {
        res.status(404).json({
          error: 'Not Found',
          message: `Wake schedule ${scheduleId} not found`,
        });
        return;
      }

      const payload = wakeScheduleSchema.parse(updated);
      res.status(200).json(payload);
    } catch (error) {
      logger.error('Failed to update wake schedule', {
        ownerSub: req.auth?.sub,
        scheduleId: req.params.id,
        correlationId: req.correlationId,
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to update wake schedule',
      });
    }
  }

  /**
   * @swagger
   * /api/schedules/{id}:
   *   delete:
   *     summary: Delete wake schedule
   *     description: Deletes a wake schedule owned by the authenticated JWT subject.
   *     tags: [Schedules]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Wake schedule ID
   *     responses:
   *       200:
   *         description: Schedule deleted
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async deleteSchedule(req: Request, res: Response): Promise<void> {
    try {
      const authSub = ownerSub(req);
      if (!authSub) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
          code: 'AUTH_UNAUTHORIZED',
        });
        return;
      }

      const scheduleId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
      if (!scheduleId) {
        badRequest(res, 'Schedule id is required');
        return;
      }

      const deleted = await WakeScheduleModel.delete(authSub, scheduleId);
      if (!deleted) {
        res.status(404).json({
          error: 'Not Found',
          message: `Wake schedule ${scheduleId} not found`,
        });
        return;
      }

      res.status(200).json({ success: true });
    } catch (error) {
      logger.error('Failed to delete wake schedule', {
        ownerSub: req.auth?.sub,
        scheduleId: req.params.id,
        correlationId: req.correlationId,
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to delete wake schedule',
      });
    }
  }
}

export default SchedulesController;
