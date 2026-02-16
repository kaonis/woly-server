import { Request, Response } from 'express';
import {
  PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  cncCapabilitiesResponseSchema,
  type CncCapabilitiesResponse,
} from '@kaonis/woly-protocol';
import logger from '../utils/logger';

const CNC_API_VERSION = '1.0.0';

const CNC_FEATURE_CAPABILITIES = {
  // Scan command endpoint parity is still in progress.
  scan: false,
  // Host metadata persistence is available through host update flows.
  notesTagsPersistence: true,
  // Schedule API CRUD + backend execution worker are available server-side.
  schedulesApi: true,
  // Mobile currently uses polling for command lifecycle visibility.
  commandStatusStreaming: false,
} as const;

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
      const response: CncCapabilitiesResponse = {
        apiVersion: CNC_API_VERSION,
        protocolVersion: PROTOCOL_VERSION,
        supportedProtocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
        capabilities: { ...CNC_FEATURE_CAPABILITIES },
      };

      const payload = cncCapabilitiesResponseSchema.parse(response);
      res.status(200).json(payload);
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
