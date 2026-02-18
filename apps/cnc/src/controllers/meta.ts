/**
 * Metadata API controller
 */

import { Request, Response } from 'express';
import { PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from '@kaonis/woly-protocol';
import { CncCapabilitiesResponse } from '../types';
import { CNC_VERSION } from '../utils/cncVersion';
import logger from '../utils/logger';
import { buildCncRateLimits } from '../services/capabilityRateLimits';

const FALLBACK_CNC_API_VERSION = '0.0.0';
const FALLBACK_PROTOCOL_VERSION = (() => {
  const firstSupported = Array.isArray(SUPPORTED_PROTOCOL_VERSIONS)
    ? SUPPORTED_PROTOCOL_VERSIONS.find(
      (version): version is string => typeof version === 'string' && version.trim().length > 0,
    )
    : undefined;
  return firstSupported ?? '1.0.0';
})();

function resolveCapabilityVersion(
  candidate: unknown,
  fallback: string,
  field: 'cncApi' | 'protocol',
): string {
  if (typeof candidate === 'string' && candidate.trim().length > 0) {
    return candidate.trim();
  }

  logger.warn('Capabilities version missing or invalid; using fallback', {
    field,
    fallback,
    receivedType: typeof candidate,
  });
  return fallback;
}

const capabilityMatrix: CncCapabilitiesResponse['capabilities'] = {
  scan: {
    supported: true,
    routes: ['/api/hosts/ports/:fqn', '/api/hosts/scan-ports/:fqn'],
    note: 'Per-host open-port telemetry is available through node-side TCP probing and cached in host payloads for short-lived reuse.',
  },
  notesTags: {
    supported: true,
    persistence: 'backend',
    note: 'Host notes/tags are accepted via PUT /api/hosts/:fqn.',
  },
  schedules: {
    supported: true,
    routes: ['/api/schedules', '/api/schedules/:id'],
    persistence: 'backend',
    note: 'Host wake schedules are persisted and executed in CNC backend. Legacy /api/hosts/* schedule routes remain supported.',
  },
  commandStatusStreaming: {
    supported: false,
    transport: null,
    note: 'Dedicated frontend-facing stream is planned alongside kaonis/woly#311.',
  },
};

export function buildCncCapabilitiesResponse(
  versions: { cncApi?: unknown; protocol?: unknown } = {},
): CncCapabilitiesResponse {
  const cncApi = resolveCapabilityVersion(
    versions.cncApi ?? CNC_VERSION,
    FALLBACK_CNC_API_VERSION,
    'cncApi',
  );
  const protocol = resolveCapabilityVersion(
    versions.protocol ?? PROTOCOL_VERSION,
    FALLBACK_PROTOCOL_VERSION,
    'protocol',
  );

  return {
    mode: 'cnc',
    versions: {
      cncApi,
      protocol,
    },
    capabilities: capabilityMatrix,
    rateLimits: buildCncRateLimits(),
  };
}

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
    res.json(buildCncCapabilitiesResponse());
  }
}

export default MetaController;
