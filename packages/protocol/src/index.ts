import { z } from 'zod';

// --- Protocol versioning ---

export const PROTOCOL_VERSION = '1.5.0' as const;
export const SUPPORTED_PROTOCOL_VERSIONS: readonly string[] = [
  PROTOCOL_VERSION,
  '1.4.0',
  '1.3.0',
  '1.2.0',
  '1.1.1',
  '1.0.0',
];

// --- Shared types ---

export type HostStatus = 'awake' | 'asleep';
export type HostPowerAction = 'sleep' | 'shutdown';
export type HostPowerPlatform = 'linux' | 'macos' | 'windows';
export type HostPowerTransport = 'ssh';
export type HostPowerSshStrictHostKeyChecking = 'enforce' | 'accept-new' | 'off';

export interface HostPowerControlSshConfig {
  username: string;
  port?: number;
  privateKeyPath?: string;
  strictHostKeyChecking?: HostPowerSshStrictHostKeyChecking;
}

export interface HostPowerControlCommandOverrides {
  sleep?: string;
  shutdown?: string;
}

export interface HostPowerControlConfig {
  enabled: boolean;
  transport: HostPowerTransport;
  platform: HostPowerPlatform;
  ssh: HostPowerControlSshConfig;
  commands?: HostPowerControlCommandOverrides;
}

/**
 * Canonical host representation shared across all WoLy apps.
 * Previously named `HostPayload`; the old name is kept as a deprecated alias.
 */
export interface Host {
  name: string;
  mac: string;
  secondaryMacs?: string[];
  ip: string;
  wolPort?: number;
  status: HostStatus;
  lastSeen: string | null;
  discovered: number;
  pingResponsive?: number | null;
  notes?: string | null;
  tags?: string[];
  powerControl?: HostPowerControlConfig | null;
  openPorts?: HostPort[];
  portsScannedAt?: string | null;
  portsExpireAt?: string | null;
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

// --- Wake verification ---

export type WakeVerificationStatus = 'pending' | 'confirmed' | 'timeout' | 'failed';

export interface WakeVerificationResult {
  status: WakeVerificationStatus;
  attempts: number;
  elapsedMs: number;
  source?: 'arp' | 'ping';
  startedAt: string;
  confirmedAt?: string | null;
}

export interface WakeVerifyOptions {
  timeoutMs: number;
  pollIntervalMs: number;
}

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

export type CncRateLimitScope = 'ip' | 'connection' | 'global';

export interface CncRateLimitDescriptor {
  maxCalls: number;
  windowMs: number | null;
  scope: CncRateLimitScope;
  appliesTo?: string[];
  note?: string;
}

export interface CncRateLimits {
  strictAuth: CncRateLimitDescriptor;
  auth: CncRateLimitDescriptor;
  api: CncRateLimitDescriptor;
  scheduleSync: CncRateLimitDescriptor;
  wsInboundMessages: CncRateLimitDescriptor;
  wsConnectionsPerIp: CncRateLimitDescriptor;
  macVendorLookup: CncRateLimitDescriptor;
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
    hostStateStreaming?: CncCapabilityDescriptor;
    commandStatusStreaming: CncCapabilityDescriptor;
    wakeVerification?: CncCapabilityDescriptor;
  };
  rateLimits?: CncRateLimits;
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

export interface HostStatusHistoryEntry {
  hostFqn: string;
  oldStatus: HostStatus;
  newStatus: HostStatus;
  changedAt: string;
}

export interface HostStatusHistoryResponse {
  hostFqn: string;
  from: string;
  to: string;
  entries: HostStatusHistoryEntry[];
}

export interface HostUptimeSummary {
  hostFqn: string;
  period: string;
  from: string;
  to: string;
  uptimePercentage: number;
  awakeMs: number;
  asleepMs: number;
  transitions: number;
  currentStatus: HostStatus;
}

export const WEBHOOK_EVENT_TYPES = [
  'host.awake',
  'host.asleep',
  'host.discovered',
  'host.removed',
  'scan.complete',
  'node.connected',
  'node.disconnected',
] as const;

export type WebhookEventType = typeof WEBHOOK_EVENT_TYPES[number];

export interface WebhookSubscription {
  id: string;
  url: string;
  events: WebhookEventType[];
  hasSecret: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWebhookRequest {
  url: string;
  events: WebhookEventType[];
  secret?: string;
}

export interface WebhooksResponse {
  webhooks: WebhookSubscription[];
}

export interface WebhookDeliveryLog {
  id: number;
  webhookId: string;
  eventType: WebhookEventType;
  attempt: number;
  status: 'success' | 'failed';
  responseStatus: number | null;
  error: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface WebhookDeliveriesResponse {
  webhookId: string;
  deliveries: WebhookDeliveryLog[];
}

export const PUSH_NOTIFICATION_EVENT_TYPES = [
  'host.awake',
  'host.asleep',
  'scan.complete',
  'schedule.wake',
  'node.disconnected',
] as const;

export type PushNotificationEventType = typeof PUSH_NOTIFICATION_EVENT_TYPES[number];

export type PushNotificationPlatform = 'ios' | 'android';

export interface NotificationQuietHours {
  startHour: number;
  endHour: number;
  timezone?: string;
}

export interface NotificationPreferences {
  enabled: boolean;
  events: PushNotificationEventType[];
  quietHours?: NotificationQuietHours | null;
}

export interface DeviceRegistrationRequest {
  platform: PushNotificationPlatform;
  token: string;
  preferences?: NotificationPreferences;
}

export interface DeviceRegistration {
  id: string;
  userId: string;
  platform: PushNotificationPlatform;
  token: string;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
}

export interface DevicesResponse {
  devices: DeviceRegistration[];
}

export interface DeviceDeregistrationResponse {
  success: boolean;
  token: string;
}

export interface NotificationPreferencesResponse {
  userId: string;
  preferences: NotificationPreferences;
}

export interface HostPingResult {
  hostName: string;
  mac: string;
  ip: string;
  reachable: boolean;
  status: HostStatus;
  latencyMs: number;
  checkedAt: string;
}

export interface HostPortScanResult {
  hostName: string;
  mac: string;
  ip: string;
  scannedAt: string;
  openPorts: HostPort[];
}

// --- Mobile host-state stream event types ---

export const HOST_STATE_STREAM_MUTATING_EVENT_TYPES = [
  'host.discovered',
  'host.updated',
  'host.removed',
  'hosts.changed',
  'hosts.snapshot',
  'node.online',
  'node.offline',
  'node.status_changed',
  'wake.verified',
] as const;

export const HOST_STATE_STREAM_NON_MUTATING_EVENT_TYPES = [
  'connected',
  'heartbeat',
  'keepalive',
  'ping',
  'pong',
] as const;

export type HostStateStreamMutatingEventType =
  typeof HOST_STATE_STREAM_MUTATING_EVENT_TYPES[number];

export type HostStateStreamNonMutatingEventType =
  typeof HOST_STATE_STREAM_NON_MUTATING_EVENT_TYPES[number];

export type HostStateStreamEventType =
  | HostStateStreamMutatingEventType
  | HostStateStreamNonMutatingEventType;

export interface HostStateStreamMutatingEvent {
  type: HostStateStreamMutatingEventType;
  changed: true;
  timestamp: string;
  payload?: Record<string, unknown>;
}

export interface HostStateStreamNonMutatingEvent {
  type: HostStateStreamNonMutatingEventType;
  changed?: false;
  timestamp: string;
  payload?: Record<string, unknown>;
}

export type HostStateStreamEvent =
  | HostStateStreamMutatingEvent
  | HostStateStreamNonMutatingEvent;

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
        hostPing?: HostPingResult;
        hostPortScan?: HostPortScanResult;
        wakeVerification?: WakeVerificationResult;
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
  | {
      type: 'wake';
      commandId: string;
      data: { hostName: string; mac: string; wolPort?: number; verify?: WakeVerifyOptions };
    }
  | { type: 'scan'; commandId: string; data: { immediate: boolean } }
  | {
      type: 'scan-host-ports';
      commandId: string;
      data: {
        hostName: string;
        mac: string;
        ip: string;
        ports?: number[];
        timeoutMs?: number;
      };
    }
  | {
      type: 'update-host';
      commandId: string;
      data: {
        currentName?: string;
        name: string;
        mac?: string;
        secondaryMacs?: string[];
        ip?: string;
        wolPort?: number;
        status?: HostStatus;
        notes?: string | null;
        tags?: string[];
        powerControl?: HostPowerControlConfig | null;
      };
    }
  | { type: 'delete-host'; commandId: string; data: { name: string } }
  | {
      type: 'ping-host';
      commandId: string;
      data: {
        hostName: string;
        mac: string;
        ip: string;
      };
    }
  | {
      type: 'sleep-host';
      commandId: string;
      data: {
        hostName: string;
        mac: string;
        ip: string;
        confirmation: 'sleep';
      };
    }
  | {
      type: 'shutdown-host';
      commandId: string;
      data: {
        hostName: string;
        mac: string;
        ip: string;
        confirmation: 'shutdown';
      };
    }
  | { type: 'ping'; data: { timestamp: Date } }
  | { type: 'error'; message: string };

// --- Zod schemas ---

export const hostStatusSchema = z.enum(['awake', 'asleep']);
export const hostNotesSchema = z.string().max(2_000).nullable();
export const hostTagsSchema = z.array(z.string().min(1).max(64)).max(32);
export const hostPortSchema: z.ZodType<HostPort> = z.object({
  port: z.number().int().positive(),
  protocol: z.literal('tcp'),
  service: z.string().min(1),
});
export const wolPortSchema = z.number().int().min(1).max(65535);
export const hostPowerPlatformSchema = z.enum(['linux', 'macos', 'windows']);
export const hostPowerSshStrictHostKeyCheckingSchema = z.enum(['enforce', 'accept-new', 'off']);
export const hostPowerControlSchema: z.ZodType<HostPowerControlConfig> = z
  .object({
    enabled: z.boolean(),
    transport: z.literal('ssh'),
    platform: hostPowerPlatformSchema,
    ssh: z
      .object({
        username: z.string().min(1).max(255),
        port: z.number().int().min(1).max(65535).optional(),
        privateKeyPath: z.string().min(1).max(2048).optional(),
        strictHostKeyChecking: hostPowerSshStrictHostKeyCheckingSchema.optional(),
      })
      .strict(),
    commands: z
      .object({
        sleep: z.string().min(1).max(1024).optional(),
        shutdown: z.string().min(1).max(1024).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const hostSchema = z.object({
  name: z.string().min(1),
  mac: z.string().min(1),
  secondaryMacs: z.array(z.string().min(1)).max(32).optional(),
  ip: z.string().min(1),
  wolPort: wolPortSchema.optional(),
  status: hostStatusSchema,
  lastSeen: z.string().nullable(),
  discovered: z.number().int(),
  pingResponsive: z.number().int().nullable().optional(),
  notes: hostNotesSchema.optional(),
  tags: hostTagsSchema.optional(),
  powerControl: hostPowerControlSchema.nullable().optional(),
  openPorts: z.array(hostPortSchema).optional(),
  portsScannedAt: z.string().min(1).nullable().optional(),
  portsExpireAt: z.string().min(1).nullable().optional(),
});

export const hostPingResultSchema: z.ZodType<HostPingResult> = z.object({
  hostName: z.string().min(1),
  mac: z.string().min(1),
  ip: z.string().min(1),
  reachable: z.boolean(),
  status: hostStatusSchema,
  latencyMs: z.number().int().nonnegative(),
  checkedAt: z.string().min(1),
});

export const wakeVerificationStatusSchema = z.enum(['pending', 'confirmed', 'timeout', 'failed']);

export const wakeVerificationResultSchema: z.ZodType<WakeVerificationResult> = z.object({
  status: wakeVerificationStatusSchema,
  attempts: z.number().int().nonnegative(),
  elapsedMs: z.number().int().nonnegative(),
  source: z.enum(['arp', 'ping']).optional(),
  startedAt: z.string().min(1),
  confirmedAt: z.string().min(1).nullable().optional(),
});

export const wakeVerifyOptionsSchema: z.ZodType<WakeVerifyOptions> = z.object({
  timeoutMs: z.number().int().positive(),
  pollIntervalMs: z.number().int().positive(),
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

export const cncRateLimitDescriptorSchema: z.ZodType<CncRateLimitDescriptor> = z.object({
  maxCalls: z.number().int().positive(),
  windowMs: z.number().int().positive().nullable(),
  scope: z.enum(['ip', 'connection', 'global']),
  appliesTo: z.array(z.string().min(1)).optional(),
  note: z.string().min(1).optional(),
});

export const cncRateLimitsSchema: z.ZodType<CncRateLimits> = z.object({
  strictAuth: cncRateLimitDescriptorSchema,
  auth: cncRateLimitDescriptorSchema,
  api: cncRateLimitDescriptorSchema,
  scheduleSync: cncRateLimitDescriptorSchema,
  wsInboundMessages: cncRateLimitDescriptorSchema,
  wsConnectionsPerIp: cncRateLimitDescriptorSchema,
  macVendorLookup: cncRateLimitDescriptorSchema,
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
    hostStateStreaming: cncCapabilityDescriptorSchema.optional(),
    commandStatusStreaming: cncCapabilityDescriptorSchema,
    wakeVerification: cncCapabilityDescriptorSchema.optional(),
  }),
  rateLimits: cncRateLimitsSchema.optional(),
});

export const hostPortScanResultSchema: z.ZodType<HostPortScanResult> = z.object({
  hostName: z.string().min(1),
  mac: z.string().min(1),
  ip: z.string().min(1),
  scannedAt: z.string().min(1),
  openPorts: z.array(hostPortSchema),
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

const hostStateStreamPayloadSchema = z.record(z.string(), z.unknown());

const hostStateStreamMutatingEventTypeSchema: z.ZodType<HostStateStreamMutatingEventType> = z.enum(
  HOST_STATE_STREAM_MUTATING_EVENT_TYPES
);

const hostStateStreamNonMutatingEventTypeSchema: z.ZodType<HostStateStreamNonMutatingEventType> = z.enum(
  HOST_STATE_STREAM_NON_MUTATING_EVENT_TYPES
);

export const hostStateStreamEventSchema: z.ZodType<HostStateStreamEvent> = z.union([
  z.object({
    type: hostStateStreamMutatingEventTypeSchema,
    changed: z.literal(true),
    timestamp: z.string().datetime(),
    payload: hostStateStreamPayloadSchema.optional(),
  }),
  z.object({
    type: hostStateStreamNonMutatingEventTypeSchema,
    changed: z.literal(false).optional(),
    timestamp: z.string().datetime(),
    payload: hostStateStreamPayloadSchema.optional(),
  }),
]);

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

export const hostStatusHistoryEntrySchema: z.ZodType<HostStatusHistoryEntry> = z
  .object({
    hostFqn: z.string().min(1),
    oldStatus: hostStatusSchema,
    newStatus: hostStatusSchema,
    changedAt: z.string().datetime(),
  })
  .strict();

export const hostStatusHistoryResponseSchema: z.ZodType<HostStatusHistoryResponse> = z
  .object({
    hostFqn: z.string().min(1),
    from: z.string().datetime(),
    to: z.string().datetime(),
    entries: z.array(hostStatusHistoryEntrySchema),
  })
  .strict();

export const hostUptimeSummarySchema: z.ZodType<HostUptimeSummary> = z
  .object({
    hostFqn: z.string().min(1),
    period: z.string().regex(/^\d+[dhm]$/),
    from: z.string().datetime(),
    to: z.string().datetime(),
    uptimePercentage: z.number().min(0).max(100),
    awakeMs: z.number().int().nonnegative(),
    asleepMs: z.number().int().nonnegative(),
    transitions: z.number().int().nonnegative(),
    currentStatus: hostStatusSchema,
  })
  .strict();

export const webhookEventTypeSchema = z.enum(WEBHOOK_EVENT_TYPES);

export const webhookSubscriptionSchema: z.ZodType<WebhookSubscription> = z
  .object({
    id: z.string().min(1),
    url: z.string().url(),
    events: z.array(webhookEventTypeSchema).min(1),
    hasSecret: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const createWebhookRequestSchema: z.ZodType<CreateWebhookRequest> = z
  .object({
    url: z.string().url(),
    events: z.array(webhookEventTypeSchema).min(1).refine((events) => {
      return new Set(events).size === events.length;
    }, 'Webhook events must be unique'),
    secret: z.string().min(1).max(256).optional(),
  })
  .strict();

export const webhooksResponseSchema: z.ZodType<WebhooksResponse> = z
  .object({
    webhooks: z.array(webhookSubscriptionSchema),
  })
  .strict();

export const webhookDeliveryLogSchema: z.ZodType<WebhookDeliveryLog> = z
  .object({
    id: z.number().int().positive(),
    webhookId: z.string().min(1),
    eventType: webhookEventTypeSchema,
    attempt: z.number().int().min(1),
    status: z.enum(['success', 'failed']),
    responseStatus: z.number().int().min(100).max(599).nullable(),
    error: z.string().nullable(),
    payload: z.record(z.string(), z.unknown()),
    createdAt: z.string().datetime(),
  })
  .strict();

export const webhookDeliveriesResponseSchema: z.ZodType<WebhookDeliveriesResponse> = z
  .object({
    webhookId: z.string().min(1),
    deliveries: z.array(webhookDeliveryLogSchema),
  })
  .strict();

export const pushNotificationEventTypeSchema = z.enum(PUSH_NOTIFICATION_EVENT_TYPES);

export const pushNotificationPlatformSchema = z.enum(['ios', 'android']);

export const notificationQuietHoursSchema: z.ZodType<NotificationQuietHours> = z
  .object({
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(0).max(23),
    timezone: z.string().min(1).max(64).optional(),
  })
  .strict();

export const notificationPreferencesSchema: z.ZodType<NotificationPreferences> = z
  .object({
    enabled: z.boolean(),
    events: z.array(pushNotificationEventTypeSchema).min(1).refine((events) => {
      return new Set(events).size === events.length;
    }, 'Push notification events must be unique'),
    quietHours: notificationQuietHoursSchema.nullable().optional(),
  })
  .strict();

export const deviceRegistrationRequestSchema: z.ZodType<DeviceRegistrationRequest> = z
  .object({
    platform: pushNotificationPlatformSchema,
    token: z.string().min(8).max(4096),
    preferences: notificationPreferencesSchema.optional(),
  })
  .strict();

export const deviceRegistrationSchema: z.ZodType<DeviceRegistration> = z
  .object({
    id: z.string().min(1),
    userId: z.string().min(1),
    platform: pushNotificationPlatformSchema,
    token: z.string().min(8).max(4096),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    lastSeenAt: z.string().datetime(),
  })
  .strict();

export const devicesResponseSchema: z.ZodType<DevicesResponse> = z
  .object({
    devices: z.array(deviceRegistrationSchema),
  })
  .strict();

export const deviceDeregistrationResponseSchema: z.ZodType<DeviceDeregistrationResponse> = z
  .object({
    success: z.literal(true),
    token: z.string().min(1),
  })
  .strict();

export const notificationPreferencesResponseSchema: z.ZodType<NotificationPreferencesResponse> = z
  .object({
    userId: z.string().min(1),
    preferences: notificationPreferencesSchema,
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
  hostPing: hostPingResultSchema.optional(),
  hostPortScan: hostPortScanResultSchema.optional(),
  wakeVerification: wakeVerificationResultSchema.optional(),
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
      wolPort: wolPortSchema.optional(),
      verify: wakeVerifyOptionsSchema.optional(),
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
    type: z.literal('scan-host-ports'),
    commandId: z.string().min(1),
    data: z.object({
      hostName: z.string().min(1),
      mac: z.string().min(1),
      ip: z.string().min(1),
      ports: z.array(z.number().int().min(1).max(65535)).min(1).max(1024).optional(),
      timeoutMs: z.number().int().min(50).max(5000).optional(),
    }),
  }),
  z.object({
    type: z.literal('update-host'),
    commandId: z.string().min(1),
    data: z.object({
      currentName: z.string().min(1).optional(),
      name: z.string().min(1),
      mac: z.string().min(1).optional(),
      secondaryMacs: z.array(z.string().min(1)).max(32).optional(),
      ip: z.string().min(1).optional(),
      wolPort: wolPortSchema.optional(),
      status: hostStatusSchema.optional(),
      notes: hostNotesSchema.optional(),
      tags: hostTagsSchema.optional(),
      powerControl: hostPowerControlSchema.nullable().optional(),
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
    type: z.literal('ping-host'),
    commandId: z.string().min(1),
    data: z.object({
      hostName: z.string().min(1),
      mac: z.string().min(1),
      ip: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal('sleep-host'),
    commandId: z.string().min(1),
    data: z.object({
      hostName: z.string().min(1),
      mac: z.string().min(1),
      ip: z.string().min(1),
      confirmation: z.literal('sleep'),
    }),
  }),
  z.object({
    type: z.literal('shutdown-host'),
    commandId: z.string().min(1),
    data: z.object({
      hostName: z.string().min(1),
      mac: z.string().min(1),
      ip: z.string().min(1),
      confirmation: z.literal('shutdown'),
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
