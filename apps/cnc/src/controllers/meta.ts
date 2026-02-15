/**
 * Metadata API controller
 */

import { Request, Response } from 'express';
import { PROTOCOL_VERSION } from '@kaonis/woly-protocol';
import { CncCapabilitiesResponse } from '../types';
import { CNC_VERSION } from '../utils/cncVersion';

const cncCapabilities: CncCapabilitiesResponse = {
  mode: 'cnc',
  versions: {
    cncApi: CNC_VERSION,
    protocol: PROTOCOL_VERSION,
  },
  capabilities: {
    scan: {
      supported: true,
      routes: ['/api/hosts/ports/:fqn', '/api/hosts/scan-ports/:fqn'],
      note: 'Compatibility endpoints are available; per-host open-port telemetry remains protocol-limited.',
    },
    notesTags: {
      supported: true,
      persistence: 'backend',
      note: 'Host notes/tags are accepted via PUT /api/hosts/:fqn.',
    },
    schedules: {
      supported: false,
      routes: [],
      note: 'Planned in kaonis/woly-server#255.',
    },
    commandStatusStreaming: {
      supported: false,
      transport: null,
      note: 'Dedicated frontend-facing stream is planned alongside kaonis/woly#311.',
    },
  },
};

export class MetaController {
  /**
   * @swagger
   * /api/capabilities:
   *   get:
   *     summary: Get CNC capability flags and version metadata
   *     description: Returns a machine-readable capability map so clients can negotiate feature behavior without endpoint probing.
   *     tags: [Meta]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Capability descriptor payload
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 mode:
   *                   type: string
   *                   enum: [cnc]
   *                 versions:
   *                   type: object
   *                   properties:
   *                     cncApi:
   *                       type: string
   *                     protocol:
   *                       type: string
   *                 capabilities:
   *                   type: object
   *                   properties:
   *                     scan:
   *                       type: object
   *                     notesTags:
   *                       type: object
   *                     schedules:
   *                       type: object
   *                     commandStatusStreaming:
   *                       type: object
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   *       403:
   *         $ref: '#/components/responses/Forbidden'
   */
  getCapabilities(_req: Request, res: Response): void {
    res.json(cncCapabilities);
  }
}

export default MetaController;
