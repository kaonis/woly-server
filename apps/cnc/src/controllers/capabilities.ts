import { Request, Response } from 'express';
import {
  PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  type CncCapabilitiesResponse,
} from '@kaonis/woly-protocol';
import logger from '../utils/logger';

const FALLBACK_CNC_API_VERSION = '0.0.0';
const CNC_API_VERSION = '1.0.0';
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
    note: 'Host wake schedules are persisted and executed in CNC backend.',
  },
  hostStateStreaming: {
    supported: true,
    transport: 'websocket',
    routes: ['/ws/mobile/hosts'],
    note: 'Server-initiated host and node state deltas stream over WebSocket (`host.*`, `hosts.*`, `node.*`). Non-mutating `connected`/`heartbeat` style events MUST NOT trigger host refetch.',
  },
  commandStatusStreaming: {
    supported: false,
    transport: null,
    note: 'Dedicated frontend-facing stream is planned alongside kaonis/woly#311.',
  },
  wakeVerification: {
    supported: true,
    transport: 'websocket',
    note: 'Post-WoL verification results stream as wake.verified events on /ws/mobile/hosts. Request with ?verify=true on the wake endpoint.',
  },
};

export function buildCncCapabilitiesResponse(
  versions: { cncApi?: unknown; protocol?: unknown } = {},
): CncCapabilitiesResponse {
  const cncApi = resolveCapabilityVersion(
    versions.cncApi ?? CNC_API_VERSION,
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
  };
}

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
