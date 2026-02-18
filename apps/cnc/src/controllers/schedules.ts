import { Request, Response } from 'express';
import {
  createHostWakeScheduleRequestSchema,
  updateHostWakeScheduleRequestSchema,
} from '@kaonis/woly-protocol';
import { HostAggregator } from '../services/hostAggregator';
import HostScheduleModel from '../models/HostSchedule';
import { createJsonEtag, isIfNoneMatchSatisfied } from '../utils/httpCache';
import logger from '../utils/logger';

function parseEnabledQuery(value: unknown): boolean | undefined | null {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return null;
}

function buildAllowedFqnSet(hosts: unknown[]): Set<string> {
  const allowed = new Set<string>();

  for (const host of hosts) {
    if (!host || typeof host !== 'object') {
      continue;
    }

    const record = host as Record<string, unknown>;
    if (typeof record.fullyQualifiedName === 'string' && record.fullyQualifiedName.trim().length > 0) {
      allowed.add(record.fullyQualifiedName);
      continue;
    }

    if (typeof record.name === 'string' && typeof record.location === 'string') {
      allowed.add(`${record.name}@${record.location}`);
    }
  }

  return allowed;
}

export class SchedulesController {
  constructor(private readonly hostAggregator: HostAggregator) {}

  /**
   * @swagger
   * /api/schedules:
   *   get:
   *     summary: List wake schedules across all hosts
   *     tags: [Hosts]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: enabled
   *         schema:
   *           type: boolean
   *         required: false
   *         description: Optional filter for enabled/disabled schedules.
   *       - in: query
   *         name: nodeId
   *         schema:
   *           type: string
   *         required: false
   *         description: Optional node id filter.
   *     responses:
   *       200:
   *         description: Aggregated schedules list
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 schedules:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/HostWakeSchedule'
   *             examples:
   *               default:
   *                 summary: Example aggregated schedules response
   *                 value:
   *                   schedules:
   *                     - id: "schedule-1"
   *                       hostFqn: "office@home"
   *                       hostName: "office"
   *                       hostMac: "AA:BB:CC:DD:EE:FF"
   *                       scheduledTime: "2026-02-20T10:00:00.000Z"
   *                       frequency: "daily"
   *                       enabled: true
   *                       notifyOnWake: true
   *                       timezone: "UTC"
   *                       createdAt: "2026-02-18T00:00:00.000Z"
   *                       updatedAt: "2026-02-18T00:00:00.000Z"
   *       304:
   *         description: Not Modified (If-None-Match matched current ETag)
   *       400:
   *         $ref: '#/components/responses/BadRequest'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  async listSchedules(req: Request, res: Response): Promise<void> {
    try {
      const enabled = parseEnabledQuery(req.query.enabled);
      if (enabled === null) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid enabled query. Use enabled=true or enabled=false',
        });
        return;
      }

      const baseSchedules = await HostScheduleModel.listAll(
        enabled === undefined ? {} : { enabled },
      );

      let schedules = baseSchedules;
      const nodeId = req.query.nodeId;
      if (typeof nodeId === 'string') {
        const hosts = await this.hostAggregator.getHostsByNode(nodeId);
        const allowedFqns = buildAllowedFqnSet(hosts as unknown[]);
        schedules = baseSchedules.filter((schedule) => allowedFqns.has(schedule.hostFqn));
      }

      const payload = { schedules };
      const etag = createJsonEtag(payload);
      res.setHeader('ETag', etag);

      if (isIfNoneMatchSatisfied(req.header('if-none-match'), etag)) {
        res.status(304).end();
        return;
      }

      res.json(payload);
    } catch (error) {
      logger.error('Failed to list schedules', { error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to list schedules',
      });
    }
  }

  /**
   * @swagger
   * /api/schedules/{id}:
   *   get:
   *     summary: Get wake schedule by id
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
   *         description: Schedule entry
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/HostWakeSchedule'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   */
  async getSchedule(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const schedule = await HostScheduleModel.findById(id);
      if (!schedule) {
        res.status(404).json({
          error: 'Not Found',
          message: `Schedule ${id} not found`,
        });
        return;
      }

      res.json(schedule);
    } catch (error) {
      logger.error('Failed to get schedule', { id: req.params.id, error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve schedule',
      });
    }
  }

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
