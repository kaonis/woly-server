import { Request, Response } from 'express';
import {
  createHostWakeScheduleRequestSchema,
  updateHostWakeScheduleRequestSchema,
} from '@kaonis/woly-protocol';
import { HostAggregator } from '../services/hostAggregator';
import HostScheduleModel from '../models/HostSchedule';
import logger from '../utils/logger';

export class SchedulesController {
  constructor(private readonly hostAggregator: HostAggregator) {}

  /**
   * @swagger
   * /api/hosts/{fqn}/schedules:
   *   get:
   *     summary: List wake schedules for a host
   *     tags: [Hosts]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: fqn
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Host schedules
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   */
  async listHostSchedules(req: Request, res: Response): Promise<void> {
    try {
      const fqn = req.params.fqn as string;
      const host = await this.hostAggregator.getHostByFQN(fqn);

      if (!host) {
        res.status(404).json({
          error: 'Not Found',
          message: `Host ${fqn} not found`,
        });
        return;
      }

      const schedules = await HostScheduleModel.listByHostFqn(fqn);
      res.json({ schedules });
    } catch (error) {
      logger.error('Failed to list host schedules', { fqn: req.params.fqn, error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to list host schedules',
      });
    }
  }

  /**
   * @swagger
   * /api/hosts/{fqn}/schedules:
   *   post:
   *     summary: Create a wake schedule for a host
   *     tags: [Hosts]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: fqn
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       201:
   *         description: Created schedule
   *       400:
   *         $ref: '#/components/responses/BadRequest'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   */
  async createHostSchedule(req: Request, res: Response): Promise<void> {
    try {
      const fqn = req.params.fqn as string;
      const host = await this.hostAggregator.getHostByFQN(fqn);

      if (!host) {
        res.status(404).json({
          error: 'Not Found',
          message: `Host ${fqn} not found`,
        });
        return;
      }

      const parseResult = createHostWakeScheduleRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid request body',
          details: parseResult.error.issues,
        });
        return;
      }

      const payload = parseResult.data;
      const created = await HostScheduleModel.create({
        hostFqn: fqn,
        hostName: host.name,
        hostMac: host.mac,
        scheduledTime: payload.scheduledTime,
        frequency: payload.frequency,
        enabled: payload.enabled ?? true,
        notifyOnWake: payload.notifyOnWake ?? true,
        timezone: payload.timezone ?? 'UTC',
      });

      res.status(201).json(created);
    } catch (error) {
      logger.error('Failed to create host schedule', { fqn: req.params.fqn, error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to create host schedule',
      });
    }
  }

  /**
   * @swagger
   * /api/hosts/schedules/{id}:
   *   put:
   *     summary: Update wake schedule by id
   *     tags: [Hosts]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Updated schedule
   *       400:
   *         $ref: '#/components/responses/BadRequest'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   */
  async updateSchedule(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const parseResult = updateHostWakeScheduleRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid request body',
          details: parseResult.error.issues,
        });
        return;
      }

      const updated = await HostScheduleModel.update(id, parseResult.data);
      if (!updated) {
        res.status(404).json({
          error: 'Not Found',
          message: `Schedule ${id} not found`,
        });
        return;
      }

      res.json(updated);
    } catch (error) {
      logger.error('Failed to update schedule', { id: req.params.id, error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to update schedule',
      });
    }
  }

  /**
   * @swagger
   * /api/hosts/schedules/{id}:
   *   delete:
   *     summary: Delete wake schedule by id
   *     tags: [Hosts]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Deleted schedule
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   */
  async deleteSchedule(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const deleted = await HostScheduleModel.delete(id);
      if (!deleted) {
        res.status(404).json({
          error: 'Not Found',
          message: `Schedule ${id} not found`,
        });
        return;
      }

      res.json({ success: true, id });
    } catch (error) {
      logger.error('Failed to delete schedule', { id: req.params.id, error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to delete schedule',
      });
    }
  }
}

export default SchedulesController;
