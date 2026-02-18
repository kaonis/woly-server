import { Request, Response } from 'express';
import { z } from 'zod';
import { createWebhookRequestSchema } from '@kaonis/woly-protocol';
import WebhookModel from '../models/Webhook';
import logger from '../utils/logger';

const deleteParamsSchema = z.object({
  id: z.string().min(1),
});

const deliveriesParamsSchema = z.object({
  id: z.string().min(1),
});

const deliveriesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
}).passthrough();

export class WebhooksController {
  /**
   * @swagger
   * /api/webhooks:
   *   post:
   *     summary: Register a webhook endpoint
   *     description: Registers a webhook URL and subscribed event types for host/node lifecycle notifications.
   *     tags: [Webhooks]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/CreateWebhookRequest'
   *     responses:
   *       201:
   *         description: Webhook created
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/WebhookSubscription'
   *       400:
   *         $ref: '#/components/responses/BadRequest'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async createWebhook(req: Request, res: Response): Promise<void> {
    const parsed = createWebhookRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid webhook payload',
        details: parsed.error.issues,
      });
      return;
    }

    try {
      const webhook = await WebhookModel.create(parsed.data);
      res.status(201).json(webhook);
    } catch (error) {
      logger.error('Failed to create webhook', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to create webhook',
      });
    }
  }

  /**
   * @swagger
   * /api/webhooks:
   *   get:
   *     summary: List configured webhooks
   *     tags: [Webhooks]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Registered webhook list
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/WebhooksResponse'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async listWebhooks(_req: Request, res: Response): Promise<void> {
    try {
      const webhooks = await WebhookModel.list();
      res.json({ webhooks });
    } catch (error) {
      logger.error('Failed to list webhooks', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to list webhooks',
      });
    }
  }

  /**
   * @swagger
   * /api/webhooks/{id}:
   *   delete:
   *     summary: Delete a webhook registration
   *     tags: [Webhooks]
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
   *         description: Webhook deleted
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/DeleteWebhookResponse'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async deleteWebhook(req: Request, res: Response): Promise<void> {
    const parsed = deleteParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Webhook id is required',
      });
      return;
    }

    try {
      const deleted = await WebhookModel.delete(parsed.data.id);
      if (!deleted) {
        res.status(404).json({
          error: 'Not Found',
          message: `Webhook ${parsed.data.id} not found`,
        });
        return;
      }

      res.json({
        success: true,
        id: parsed.data.id,
      });
    } catch (error) {
      logger.error('Failed to delete webhook', {
        webhookId: parsed.data.id,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to delete webhook',
      });
    }
  }

  /**
   * @swagger
   * /api/webhooks/{id}/deliveries:
   *   get:
   *     summary: List webhook delivery attempts for debugging
   *     tags: [Webhooks]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: limit
   *         required: false
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 500
   *     responses:
   *       200:
   *         description: Delivery attempt logs
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/WebhookDeliveriesResponse'
   *       400:
   *         $ref: '#/components/responses/BadRequest'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async getWebhookDeliveries(req: Request, res: Response): Promise<void> {
    const parsedParams = deliveriesParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Webhook id is required',
      });
      return;
    }

    const parsedQuery = deliveriesQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid deliveries query parameters',
        details: parsedQuery.error.issues,
      });
      return;
    }

    const webhookId = parsedParams.data.id;
    const limit = parsedQuery.data.limit ?? 100;

    try {
      const webhook = await WebhookModel.findById(webhookId);
      if (!webhook) {
        res.status(404).json({
          error: 'Not Found',
          message: `Webhook ${webhookId} not found`,
        });
        return;
      }

      const deliveries = await WebhookModel.listDeliveries(webhookId, limit);
      res.json({
        webhookId,
        deliveries,
      });
    } catch (error) {
      logger.error('Failed to list webhook deliveries', {
        webhookId,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to list webhook deliveries',
      });
    }
  }
}

export default WebhooksController;
