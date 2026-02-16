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
  notes?: string | null;
  tags?: string[];
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

export interface CncCapabilityDescriptor {
  supported: boolean;
  routes?: string[];
  persistence?: 'backend' | 'local' | 'none';
  transport?: 'websocket' | 'sse' | null;
  note?: string;
}

export interface CncCapabilitiesResponse {
  mode: 'cnc';
  versions: {
    cncApi: string;
    protocol: string;
  };
  capabilities: {
    scan: CncCapabilityDescriptor;
    notesTags: CncCapabilityDescriptor;
    schedules: CncCapabilityDescriptor;
    commandStatusStreaming: CncCapabilityDescriptor;
  };
}

export interface HostPort {
  port: number;
  protocol: 'tcp';
  service: string;
}

export interface HostPortScanResponse {
  target: string;
  scannedAt: string;
  openPorts: HostPort[];
  scan?: {
    commandId?: string;
    state?: CommandState;
    nodeId?: string;
    message?: string;
  };
  message?: string;
  correlationId?: string;
}

export type ScheduleFrequency = 'once' | 'daily' | 'weekly' | 'weekdays' | 'weekends';

export interface HostWakeSchedule {
  id: string;
  hostFqn: string;
  hostName: string;
  hostMac: string;
  scheduledTime: string;
  frequency: ScheduleFrequency;
  enabled: boolean;
  notifyOnWake: boolean;
  timezone: string;
  createdAt: string;
  updatedAt: string;
  lastTriggered?: string;
  nextTrigger?: string;
}

export interface HostSchedulesResponse {
  schedules: HostWakeSchedule[];
}

export interface CreateHostWakeScheduleRequest {
  scheduledTime: string;
  frequency: ScheduleFrequency;
  enabled?: boolean;
  notifyOnWake?: boolean;
  timezone?: string;
}

export interface UpdateHostWakeScheduleRequest {
  scheduledTime?: string;
  frequency?: ScheduleFrequency;
  enabled?: boolean;
  notifyOnWake?: boolean;
  timezone?: string;
}

export interface DeleteHostWakeScheduleResponse {
  success: boolean;
  id: string;
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
        notes?: string | null;
        tags?: string[];
      };
    }
  | { type: 'delete-host'; commandId: string; data: { name: string } }
  | { type: 'ping'; data: { timestamp: Date } }
  | { type: 'error'; message: string };

// --- Zod schemas ---

export const hostStatusSchema = z.enum(['awake', 'asleep']);
export const hostNotesSchema = z.string().max(2_000).nullable();
export const hostTagsSchema = z.array(z.string().min(1).max(64)).max(32);

export const hostSchema = z.object({
  name: z.string().min(1),
  mac: z.string().min(1),
  ip: z.string().min(1),
  status: hostStatusSchema,
  lastSeen: z.string().nullable(),
  discovered: z.number().int(),
  pingResponsive: z.number().int().nullable().optional(),
  notes: hostNotesSchema.optional(),
  tags: hostTagsSchema.optional(),
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

export const cncCapabilityDescriptorSchema: z.ZodType<CncCapabilityDescriptor> = z.object({
  supported: z.boolean(),
  routes: z.array(z.string().min(1)).optional(),
  persistence: z.enum(['backend', 'local', 'none']).optional(),
  transport: z.enum(['websocket', 'sse']).nullable().optional(),
  note: z.string().min(1).optional(),
});

export const cncCapabilitiesResponseSchema: z.ZodType<CncCapabilitiesResponse> = z.object({
  mode: z.literal('cnc'),
  versions: z.object({
    cncApi: z.string().min(1),
    protocol: z.string().min(1),
  }),
  capabilities: z.object({
    scan: cncCapabilityDescriptorSchema,
    notesTags: cncCapabilityDescriptorSchema,
    schedules: cncCapabilityDescriptorSchema,
    commandStatusStreaming: cncCapabilityDescriptorSchema,
  }),
});

export const hostPortSchema: z.ZodType<HostPort> = z.object({
  port: z.number().int().positive(),
  protocol: z.literal('tcp'),
  service: z.string().min(1),
});

export const hostPortScanResponseSchema: z.ZodType<HostPortScanResponse> = z.object({
  target: z.string().min(1),
  scannedAt: z.string().min(1),
  openPorts: z.array(hostPortSchema),
  scan: z.object({
    commandId: z.string().min(1).optional(),
    state: commandStateSchema.optional(),
    nodeId: z.string().min(1).optional(),
    message: z.string().min(1).optional(),
  }).optional(),
  message: z.string().min(1).optional(),
  correlationId: z.string().min(1).optional(),
});

export const scheduleFrequencySchema = z.enum(['once', 'daily', 'weekly', 'weekdays', 'weekends']);

export const hostWakeScheduleSchema: z.ZodType<HostWakeSchedule> = z.object({
  id: z.string().min(1),
  hostFqn: z.string().min(1),
  hostName: z.string().min(1),
  hostMac: z.string().min(1),
  scheduledTime: z.string().datetime(),
  frequency: scheduleFrequencySchema,
  enabled: z.boolean(),
  notifyOnWake: z.boolean(),
  timezone: z.string().min(1).max(64),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastTriggered: z.string().datetime().optional(),
  nextTrigger: z.string().datetime().optional(),
});

export const hostSchedulesResponseSchema: z.ZodType<HostSchedulesResponse> = z.object({
  schedules: z.array(hostWakeScheduleSchema),
});

export const createHostWakeScheduleRequestSchema: z.ZodType<CreateHostWakeScheduleRequest> = z
  .object({
    scheduledTime: z.string().datetime(),
    frequency: scheduleFrequencySchema,
    enabled: z.boolean().optional(),
    notifyOnWake: z.boolean().optional(),
    timezone: z.string().min(1).max(64).optional(),
  })
  .strict();

export const updateHostWakeScheduleRequestSchema: z.ZodType<UpdateHostWakeScheduleRequest> = z
  .object({
    scheduledTime: z.string().datetime().optional(),
    frequency: scheduleFrequencySchema.optional(),
    enabled: z.boolean().optional(),
    notifyOnWake: z.boolean().optional(),
    timezone: z.string().min(1).max(64).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const deleteHostWakeScheduleResponseSchema: z.ZodType<DeleteHostWakeScheduleResponse> = z
  .object({
    success: z.literal(true),
    id: z.string().min(1),
  })
  .strict();

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
      notes: hostNotesSchema.optional(),
      tags: hostTagsSchema.optional(),
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
