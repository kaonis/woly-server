import { z } from 'zod';

// --- Protocol versioning ---

export const PROTOCOL_VERSION = '1.0.0' as const;
export const SUPPORTED_PROTOCOL_VERSIONS: readonly string[] = [PROTOCOL_VERSION];

// --- Shared types ---

export type HostStatus = 'awake' | 'asleep';

/**
 * Canonical host representation shared across all WoLy apps.
 * Previously named `HostPayload`; the old name is kept as a deprecated alias.
 */
export interface Host {
  name: string;
  mac: string;
  ip: string;
  status: HostStatus;
  lastSeen: string | null;
  discovered: number;
  pingResponsive?: number | null;
}

/** @deprecated Use `Host` instead. */
export type HostPayload = Host;

export interface NodeMetadata {
  version: string;
  platform: string;
  protocolVersion: string;
  networkInfo: {
    subnet: string;
    gateway: string;
  };
}

export interface NodeRegistration {
  nodeId: string;
  name: string;
  location: string;
  /** @deprecated Token is validated during WS upgrade. Kept optional for backwards compat. */
  authToken?: string;
  publicUrl?: string;
  metadata: NodeMetadata;
}

// --- Command lifecycle ---

export type CommandState = 'queued' | 'sent' | 'acknowledged' | 'failed' | 'timed_out';

// --- Error shape ---

export interface ErrorResponse {
  error: string;
  message: string;
  code?: string;
  details?: unknown;
}

// --- WebSocket message types ---

export type NodeMessage =
  | { type: 'register'; data: NodeRegistration }
  | { type: 'heartbeat'; data: { nodeId: string; timestamp: Date } }
  | { type: 'host-discovered'; data: { nodeId: string } & Host }
  | { type: 'host-updated'; data: { nodeId: string } & Host }
  | { type: 'host-removed'; data: { nodeId: string; name: string } }
  | { type: 'scan-complete'; data: { nodeId: string; hostCount: number } }
  | {
      type: 'command-result';
      data: {
        nodeId: string;
        commandId: string;
        success: boolean;
        message?: string;
        error?: string;
        timestamp: Date;
      };
    };

export type CommandResultPayload = Extract<NodeMessage, { type: 'command-result' }>['data'];

export interface RegisteredCommandData {
  nodeId: string;
  heartbeatInterval: number;
  protocolVersion?: string;
}

export type CncCommand =
  | { type: 'registered'; data: RegisteredCommandData }
  | { type: 'wake'; commandId: string; data: { hostName: string; mac: string } }
  | { type: 'scan'; commandId: string; data: { immediate: boolean } }
  | {
      type: 'update-host';
      commandId: string;
      data: {
        currentName?: string;
        name: string;
        mac?: string;
        ip?: string;
        status?: HostStatus;
      };
    }
  | { type: 'delete-host'; commandId: string; data: { name: string } }
  | { type: 'ping'; data: { timestamp: Date } }
  | { type: 'error'; message: string };

// --- Zod schemas ---

export const hostStatusSchema = z.enum(['awake', 'asleep']);

export const hostSchema = z.object({
  name: z.string().min(1),
  mac: z.string().min(1),
  ip: z.string().min(1),
  status: hostStatusSchema,
  lastSeen: z.string().nullable(),
  discovered: z.number().int(),
  pingResponsive: z.number().int().nullable().optional(),
});

export const commandStateSchema = z.enum([
  'queued',
  'sent',
  'acknowledged',
  'failed',
  'timed_out',
]);

export const errorResponseSchema = z.object({
  error: z.string().min(1),
  message: z.string().min(1),
  code: z.string().optional(),
  details: z.unknown().optional(),
});

const nodeMetadataSchema = z.object({
  version: z.string().min(1),
  platform: z.string().min(1),
  protocolVersion: z.string().min(1),
  networkInfo: z.object({
    subnet: z.string().min(1),
    gateway: z.string().min(1),
  }),
});

const commandResultPayloadSchema = z.object({
  nodeId: z.string().min(1),
  commandId: z.string().min(1),
  success: z.boolean(),
  message: z.string().optional(),
  error: z.string().optional(),
  timestamp: z.coerce.date(),
});

export const outboundNodeMessageSchema: z.ZodType<NodeMessage> = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('register'),
    data: z.object({
      nodeId: z.string().min(1),
      name: z.string().min(1),
      location: z.string().min(1),
      authToken: z.string().min(1).optional(),
      publicUrl: z.string().optional(),
      metadata: nodeMetadataSchema,
    }),
  }),
  z.object({
    type: z.literal('heartbeat'),
    data: z.object({
      nodeId: z.string().min(1),
      timestamp: z.coerce.date(),
    }),
  }),
  z.object({
    type: z.literal('host-discovered'),
    data: z
      .object({
        nodeId: z.string().min(1),
      })
      .merge(hostSchema),
  }),
  z.object({
    type: z.literal('host-updated'),
    data: z
      .object({
        nodeId: z.string().min(1),
      })
      .merge(hostSchema),
  }),
  z.object({
    type: z.literal('host-removed'),
    data: z.object({
      nodeId: z.string().min(1),
      name: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal('scan-complete'),
    data: z.object({
      nodeId: z.string().min(1),
      hostCount: z.number().int().nonnegative(),
    }),
  }),
  z.object({
    type: z.literal('command-result'),
    data: commandResultPayloadSchema,
  }),
]);

export const inboundCncCommandSchema: z.ZodType<CncCommand> = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('registered'),
    data: z.object({
      nodeId: z.string().min(1),
      heartbeatInterval: z.number().int().positive(),
      protocolVersion: z.string().min(1).optional(),
    }),
  }),
  z.object({
    type: z.literal('wake'),
    commandId: z.string().min(1),
    data: z.object({
      hostName: z.string().min(1),
      mac: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal('scan'),
    commandId: z.string().min(1),
    data: z.object({
      immediate: z.boolean(),
    }),
  }),
  z.object({
    type: z.literal('update-host'),
    commandId: z.string().min(1),
    data: z.object({
      currentName: z.string().min(1).optional(),
      name: z.string().min(1),
      mac: z.string().min(1).optional(),
      ip: z.string().min(1).optional(),
      status: hostStatusSchema.optional(),
    }),
  }),
  z.object({
    type: z.literal('delete-host'),
    commandId: z.string().min(1),
    data: z.object({
      name: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal('ping'),
    data: z.object({
      timestamp: z.coerce.date(),
    }),
  }),
  z.object({
    type: z.literal('error'),
    message: z.string().min(1),
  }),
]);
