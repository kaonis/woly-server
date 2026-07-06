import { Request, Response } from 'express';
import logger from '../utils/logger';
import { buildCncCapabilitiesResponse } from './meta';

export { buildCncCapabilitiesResponse } from './meta';

export class CapabilitiesController {
  /**
   * @swagger
   * /api/capabilities:
   *   get:
   *     summary: Get CNC API capability flags for frontend feature negotiation
   *     description: Returns API/protocol versions and supported CNC feature flags used by mobile clients.
   *     tags: [Capabilities]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Capabilities payload
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/CapabilitiesResponse'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  async getCapabilities(req: Request, res: Response): Promise<void> {
    try {
      res.status(200).json(buildCncCapabilitiesResponse());
    } catch (error) {
      logger.error('Failed to get capabilities', {
        correlationId: req.correlationId,
        error: error instanceof Error ? error.message : String(error),
      });

      const errorBody: { error: string; message: string; correlationId?: string } = {
        error: 'Internal Server Error',
        message: 'Failed to retrieve capabilities',
      };
      if (req.correlationId) {
        errorBody.correlationId = req.correlationId;
      }
      res.status(500).json(errorBody);
    }
  }
}
