import { Request, Response } from 'express';
import {
  deviceRegistrationRequestSchema,
  notificationPreferencesSchema,
} from '@kaonis/woly-protocol';
import { z } from 'zod';
import PushNotificationModel from '../models/PushNotification';
import logger from '../utils/logger';

const deviceTokenParamsSchema = z.object({
  token: z.string().min(8).max(4096),
});

export class NotificationsController {
  async registerDevice(req: Request, res: Response): Promise<void> {
    if (!req.auth?.sub) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }

    const parsed = deviceRegistrationRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid device registration payload',
        details: parsed.error.issues,
      });
      return;
    }

    try {
      const device = await PushNotificationModel.upsertDevice({
        userId: req.auth.sub,
        platform: parsed.data.platform,
        token: parsed.data.token,
      });

      if (parsed.data.preferences) {
        await PushNotificationModel.upsertPreferences(req.auth.sub, parsed.data.preferences);
      }

      res.status(201).json(device);
    } catch (error) {
      logger.error('Failed to register push device token', {
        userId: req.auth.sub,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to register push device token',
      });
    }
  }

  async listDevices(req: Request, res: Response): Promise<void> {
    if (!req.auth?.sub) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }

    try {
      const devices = await PushNotificationModel.listDevicesByUser(req.auth.sub);
      res.json({ devices });
    } catch (error) {
      logger.error('Failed to list push devices', {
        userId: req.auth.sub,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to list push devices',
      });
    }
  }

  async deregisterDevice(req: Request, res: Response): Promise<void> {
    if (!req.auth?.sub) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }

    const parsed = deviceTokenParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid device token path parameter',
        details: parsed.error.issues,
      });
      return;
    }

    try {
      const removed = await PushNotificationModel.deleteDevice(req.auth.sub, parsed.data.token);
      if (!removed) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Push device token not found',
        });
        return;
      }

      res.json({
        success: true,
        token: parsed.data.token,
      });
    } catch (error) {
      logger.error('Failed to deregister push device token', {
        userId: req.auth.sub,
        token: parsed.data.token,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to deregister push device token',
      });
    }
  }

  async getPreferences(req: Request, res: Response): Promise<void> {
    if (!req.auth?.sub) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }

    try {
      const preferences = await PushNotificationModel.getPreferences(req.auth.sub);
      res.json({
        userId: req.auth.sub,
        preferences,
      });
    } catch (error) {
      logger.error('Failed to load notification preferences', {
        userId: req.auth.sub,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to load notification preferences',
      });
    }
  }

  async updatePreferences(req: Request, res: Response): Promise<void> {
    if (!req.auth?.sub) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }

    const parsed = notificationPreferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid notification preferences payload',
        details: parsed.error.issues,
      });
      return;
    }

    try {
      const preferences = await PushNotificationModel.upsertPreferences(req.auth.sub, parsed.data);
      res.json({
        userId: req.auth.sub,
        preferences,
      });
    } catch (error) {
      logger.error('Failed to update notification preferences', {
        userId: req.auth.sub,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to update notification preferences',
      });
    }
  }
}

export default NotificationsController;
