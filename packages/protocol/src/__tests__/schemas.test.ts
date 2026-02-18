import {
  createWebhookRequestSchema,
  cncCapabilitiesResponseSchema,
  cncCapabilityDescriptorSchema,
  cncRateLimitDescriptorSchema,
  cncRateLimitsSchema,
  createHostWakeScheduleRequestSchema,
  deleteHostWakeScheduleResponseSchema,
  hostPortScanResponseSchema,
  hostStatusHistoryEntrySchema,
  hostStatusHistoryResponseSchema,
  hostSchedulesResponseSchema,
  hostUptimeSummarySchema,
  hostWakeScheduleSchema,
  webhookDeliveriesResponseSchema,
  webhookDeliveryLogSchema,
  webhookEventTypeSchema,
  webhooksResponseSchema,
  webhookSubscriptionSchema,
  hostSchema,
  hostStateStreamEventSchema,
  HOST_STATE_STREAM_MUTATING_EVENT_TYPES,
  HOST_STATE_STREAM_NON_MUTATING_EVENT_TYPES,
  hostStatusSchema,
  scheduleFrequencySchema,
  commandStateSchema,
  errorResponseSchema,
  outboundNodeMessageSchema,
  updateHostWakeScheduleRequestSchema,
  inboundCncCommandSchema,
  wakeVerificationStatusSchema,
  wakeVerificationResultSchema,
  wakeVerifyOptionsSchema,
  PROTOCOL_VERSION,
} from '../index';

// ---------------------------------------------------------------------------
// hostStatusSchema
// ---------------------------------------------------------------------------

describe('hostStatusSchema', () => {
  it.each(['awake', 'asleep'])('accepts "%s"', (status) => {
    expect(hostStatusSchema.safeParse(status).success).toBe(true);
  });

  it('rejects unknown status', () => {
    expect(hostStatusSchema.safeParse('sleeping').success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(hostStatusSchema.safeParse('').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hostSchema
// ---------------------------------------------------------------------------

describe('hostSchema', () => {
  const validHost = {
    name: 'office-pc',
    mac: 'AA:BB:CC:DD:EE:FF',
    ip: '192.168.1.10',
    status: 'awake',
    lastSeen: '2025-01-01T00:00:00Z',
    discovered: 1,
  };

  it('accepts a valid host', () => {
    expect(hostSchema.safeParse(validHost).success).toBe(true);
  });

  it('accepts host with null lastSeen', () => {
    expect(hostSchema.safeParse({ ...validHost, lastSeen: null }).success).toBe(true);
  });

  it('accepts host with pingResponsive', () => {
    expect(hostSchema.safeParse({ ...validHost, pingResponsive: 1 }).success).toBe(true);
  });

  it('accepts host with custom wolPort', () => {
    expect(hostSchema.safeParse({ ...validHost, wolPort: 7 }).success).toBe(true);
  });

  it('rejects host with out-of-range wolPort', () => {
    expect(hostSchema.safeParse({ ...validHost, wolPort: 70000 }).success).toBe(false);
  });

  it('accepts host with null pingResponsive', () => {
    expect(hostSchema.safeParse({ ...validHost, pingResponsive: null }).success).toBe(true);
  });

  it('accepts host without pingResponsive (optional)', () => {
    const { pingResponsive: _, ...withoutPing } = { ...validHost, pingResponsive: 1 };
    expect(hostSchema.safeParse(withoutPing).success).toBe(true);
  });

  it('accepts host with notes and tags metadata', () => {
    expect(
      hostSchema.safeParse({
        ...validHost,
        notes: 'Preferred machine for deployments',
        tags: ['prod', 'linux'],
      }).success
    ).toBe(true);
  });

  it('accepts host with null notes and empty tags', () => {
    expect(
      hostSchema.safeParse({
        ...validHost,
        notes: null,
        tags: [],
      }).success
    ).toBe(true);
  });

  it('accepts host with cached open ports metadata', () => {
    expect(
      hostSchema.safeParse({
        ...validHost,
        openPorts: [
          { port: 22, protocol: 'tcp', service: 'SSH' },
          { port: 443, protocol: 'tcp', service: 'HTTPS' },
        ],
        portsScannedAt: '2026-02-17T00:00:00.000Z',
        portsExpireAt: '2026-02-17T04:00:00.000Z',
      }).success
    ).toBe(true);
  });

  it('accepts host with secondaryMacs', () => {
    expect(
      hostSchema.safeParse({
        ...validHost,
        secondaryMacs: ['11:22:33:44:55:66', 'AA-BB-CC-DD-EE-11'],
      }).success
    ).toBe(true);
  });

  it('rejects host with invalid cached port protocol', () => {
    expect(
      hostSchema.safeParse({
        ...validHost,
        openPorts: [{ port: 53, protocol: 'udp', service: 'DNS' }],
      }).success
    ).toBe(false);
  });

  it('rejects empty name', () => {
    expect(hostSchema.safeParse({ ...validHost, name: '' }).success).toBe(false);
  });

  it('rejects missing mac', () => {
    const { mac: _, ...noMac } = validHost;
    expect(hostSchema.safeParse(noMac).success).toBe(false);
  });

  it('rejects non-integer discovered', () => {
    expect(hostSchema.safeParse({ ...validHost, discovered: 1.5 }).success).toBe(false);
  });

  it('rejects tag metadata with empty values', () => {
    expect(hostSchema.safeParse({ ...validHost, tags: [''] }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// commandStateSchema
// ---------------------------------------------------------------------------

describe('commandStateSchema', () => {
  it.each(['queued', 'sent', 'acknowledged', 'failed', 'timed_out'])(
    'accepts "%s"',
    (state) => {
      expect(commandStateSchema.safeParse(state).success).toBe(true);
    },
  );

  it('rejects unknown state', () => {
    expect(commandStateSchema.safeParse('cancelled').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// errorResponseSchema
// ---------------------------------------------------------------------------

describe('errorResponseSchema', () => {
  it('accepts minimal error response', () => {
    const result = errorResponseSchema.safeParse({
      error: 'NOT_FOUND',
      message: 'Host not found',
    });
    expect(result.success).toBe(true);
  });

  it('accepts error response with code and details', () => {
    const result = errorResponseSchema.safeParse({
      error: 'VALIDATION_ERROR',
      message: 'Invalid input',
      code: 'ERR_VALIDATION',
      details: { field: 'mac', issue: 'invalid format' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty error string', () => {
    expect(
      errorResponseSchema.safeParse({ error: '', message: 'Something' }).success,
    ).toBe(false);
  });

  it('rejects missing message', () => {
    expect(errorResponseSchema.safeParse({ error: 'ERR' }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// wakeVerificationStatusSchema / wakeVerificationResultSchema / wakeVerifyOptionsSchema
// ---------------------------------------------------------------------------

describe('wakeVerificationStatusSchema', () => {
  it.each(['pending', 'confirmed', 'timeout', 'failed'])('accepts "%s"', (status) => {
    expect(wakeVerificationStatusSchema.safeParse(status).success).toBe(true);
  });

  it('rejects unknown verification status', () => {
    expect(wakeVerificationStatusSchema.safeParse('cancelled').success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(wakeVerificationStatusSchema.safeParse('').success).toBe(false);
  });
});

describe('wakeVerificationResultSchema', () => {
  const validResult = {
    status: 'confirmed',
    attempts: 8,
    elapsedMs: 24000,
    source: 'ping',
    startedAt: '2026-02-18T00:00:00.000Z',
    confirmedAt: '2026-02-18T00:00:24.000Z',
  };

  it('accepts a valid confirmed wake verification result', () => {
    expect(wakeVerificationResultSchema.safeParse(validResult).success).toBe(true);
  });

  it('accepts a timeout result with null confirmedAt', () => {
    expect(
      wakeVerificationResultSchema.safeParse({
        ...validResult,
        status: 'timeout',
        confirmedAt: null,
      }).success
    ).toBe(true);
  });

  it('accepts a pending result without optional fields', () => {
    expect(
      wakeVerificationResultSchema.safeParse({
        status: 'pending',
        attempts: 0,
        elapsedMs: 0,
        startedAt: '2026-02-18T00:00:00.000Z',
      }).success
    ).toBe(true);
  });

  it('accepts source "arp"', () => {
    expect(
      wakeVerificationResultSchema.safeParse({
        ...validResult,
        source: 'arp',
      }).success
    ).toBe(true);
  });

  it('rejects invalid source value', () => {
    expect(
      wakeVerificationResultSchema.safeParse({
        ...validResult,
        source: 'icmp',
      }).success
    ).toBe(false);
  });

  it('rejects negative attempts', () => {
    expect(
      wakeVerificationResultSchema.safeParse({
        ...validResult,
        attempts: -1,
      }).success
    ).toBe(false);
  });

  it('rejects negative elapsedMs', () => {
    expect(
      wakeVerificationResultSchema.safeParse({
        ...validResult,
        elapsedMs: -100,
      }).success
    ).toBe(false);
  });

  it('rejects missing startedAt', () => {
    const { startedAt: _, ...noStartedAt } = validResult;
    expect(wakeVerificationResultSchema.safeParse(noStartedAt).success).toBe(false);
  });
});

describe('wakeVerifyOptionsSchema', () => {
  it('accepts valid verify options', () => {
    expect(
      wakeVerifyOptionsSchema.safeParse({
        timeoutMs: 120000,
        pollIntervalMs: 3000,
      }).success
    ).toBe(true);
  });

  it('rejects non-positive timeoutMs', () => {
    expect(
      wakeVerifyOptionsSchema.safeParse({
        timeoutMs: 0,
        pollIntervalMs: 3000,
      }).success
    ).toBe(false);
  });

  it('rejects non-positive pollIntervalMs', () => {
    expect(
      wakeVerifyOptionsSchema.safeParse({
        timeoutMs: 120000,
        pollIntervalMs: 0,
      }).success
    ).toBe(false);
  });

  it('rejects missing fields', () => {
    expect(wakeVerifyOptionsSchema.safeParse({ timeoutMs: 120000 }).success).toBe(false);
    expect(wakeVerifyOptionsSchema.safeParse({ pollIntervalMs: 3000 }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// cncCapabilityDescriptorSchema / cncCapabilitiesResponseSchema
// ---------------------------------------------------------------------------

describe('cncCapabilityDescriptorSchema', () => {
  it('accepts minimal capability descriptor', () => {
    expect(cncCapabilityDescriptorSchema.safeParse({ supported: true }).success).toBe(true);
  });

  it('accepts descriptor with routes/persistence/transport/note', () => {
    expect(
      cncCapabilityDescriptorSchema.safeParse({
        supported: true,
        routes: ['/api/hosts/scan-ports/:fqn'],
        persistence: 'backend',
        transport: 'websocket',
        note: 'Feature is available',
      }).success
    ).toBe(true);
  });

  it('rejects unsupported persistence value', () => {
    expect(
      cncCapabilityDescriptorSchema.safeParse({
        supported: true,
        persistence: 'remote',
      }).success
    ).toBe(false);
  });
});

describe('cncRateLimitDescriptorSchema', () => {
  it('accepts rate-limit descriptor with window metadata', () => {
    expect(
      cncRateLimitDescriptorSchema.safeParse({
        maxCalls: 300,
        windowMs: 900000,
        scope: 'ip',
        appliesTo: ['/api/hosts'],
      }).success
    ).toBe(true);
  });

  it('accepts concurrent-cap descriptor with null window', () => {
    expect(
      cncRateLimitDescriptorSchema.safeParse({
        maxCalls: 10,
        windowMs: null,
        scope: 'ip',
      }).success
    ).toBe(true);
  });

  it('rejects non-positive maxCalls', () => {
    expect(
      cncRateLimitDescriptorSchema.safeParse({
        maxCalls: 0,
        windowMs: 1000,
        scope: 'global',
      }).success
    ).toBe(false);
  });
});

describe('cncRateLimitsSchema', () => {
  it('accepts full CNC rate-limit map', () => {
    expect(
      cncRateLimitsSchema.safeParse({
        strictAuth: { maxCalls: 5, windowMs: 900000, scope: 'ip' },
        auth: { maxCalls: 10, windowMs: 900000, scope: 'ip' },
        api: { maxCalls: 300, windowMs: 900000, scope: 'ip' },
        scheduleSync: { maxCalls: 3000, windowMs: 900000, scope: 'ip' },
        wsInboundMessages: { maxCalls: 100, windowMs: 1000, scope: 'connection' },
        wsConnectionsPerIp: { maxCalls: 10, windowMs: null, scope: 'ip' },
        macVendorLookup: { maxCalls: 1, windowMs: 1000, scope: 'global' },
      }).success
    ).toBe(true);
  });
});

describe('cncCapabilitiesResponseSchema', () => {
  const capability = { supported: true };

  it('accepts valid CNC capabilities payload', () => {
    expect(
      cncCapabilitiesResponseSchema.safeParse({
        mode: 'cnc',
        versions: {
          cncApi: '1.0.0',
          protocol: '1.0.0',
        },
        capabilities: {
          scan: capability,
          notesTags: capability,
          schedules: { supported: false },
          hostStateStreaming: { supported: true, transport: 'websocket' },
          commandStatusStreaming: { supported: false, transport: null },
        },
        rateLimits: {
          strictAuth: { maxCalls: 5, windowMs: 900000, scope: 'ip' },
          auth: { maxCalls: 10, windowMs: 900000, scope: 'ip' },
          api: { maxCalls: 300, windowMs: 900000, scope: 'ip' },
          scheduleSync: { maxCalls: 3000, windowMs: 900000, scope: 'ip' },
          wsInboundMessages: { maxCalls: 100, windowMs: 1000, scope: 'connection' },
          wsConnectionsPerIp: { maxCalls: 10, windowMs: null, scope: 'ip' },
          macVendorLookup: { maxCalls: 1, windowMs: 1000, scope: 'global' },
        },
      }).success
    ).toBe(true);
  });

  it('accepts capabilities payload with optional wakeVerification', () => {
    expect(
      cncCapabilitiesResponseSchema.safeParse({
        mode: 'cnc',
        versions: {
          cncApi: '1.0.0',
          protocol: '1.3.0',
        },
        capabilities: {
          scan: capability,
          notesTags: capability,
          schedules: capability,
          hostStateStreaming: { supported: true, transport: 'websocket' },
          commandStatusStreaming: { supported: false, transport: null },
          wakeVerification: { supported: true, transport: 'websocket' },
        },
      }).success
    ).toBe(true);
  });

  it('rejects non-cnc mode', () => {
    expect(
      cncCapabilitiesResponseSchema.safeParse({
        mode: 'standalone',
        versions: {
          cncApi: '1.0.0',
          protocol: '1.0.0',
        },
        capabilities: {
          scan: capability,
          notesTags: capability,
          schedules: capability,
          commandStatusStreaming: capability,
        },
      }).success
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hostStateStreamEventSchema
// ---------------------------------------------------------------------------

describe('hostStateStreamEventSchema', () => {
  it('accepts mutating host-state stream events with changed=true', () => {
    const result = hostStateStreamEventSchema.safeParse({
      type: HOST_STATE_STREAM_MUTATING_EVENT_TYPES[0],
      changed: true,
      timestamp: '2026-02-18T00:00:00.000Z',
      payload: { nodeId: 'node-1', hostName: 'office-pc' },
    });

    expect(result.success).toBe(true);
  });

  it('accepts non-mutating stream events with optional changed=false', () => {
    const connected = hostStateStreamEventSchema.safeParse({
      type: 'connected',
      timestamp: '2026-02-18T00:00:00.000Z',
      payload: { subscriber: 'mobile-client' },
    });
    expect(connected.success).toBe(true);

    const keepalive = hostStateStreamEventSchema.safeParse({
      type: HOST_STATE_STREAM_NON_MUTATING_EVENT_TYPES[1],
      changed: false,
      timestamp: '2026-02-18T00:00:01.000Z',
    });
    expect(keepalive.success).toBe(true);
  });

  it('rejects mutating events when changed flag is not true', () => {
    const result = hostStateStreamEventSchema.safeParse({
      type: 'host.updated',
      changed: false,
      timestamp: '2026-02-18T00:00:00.000Z',
    });

    expect(result.success).toBe(false);
  });

  it('rejects non-mutating events when changed flag is true', () => {
    const result = hostStateStreamEventSchema.safeParse({
      type: 'heartbeat',
      changed: true,
      timestamp: '2026-02-18T00:00:00.000Z',
    });

    expect(result.success).toBe(false);
  });

  it('accepts wake.verified as a valid mutating event', () => {
    const result = hostStateStreamEventSchema.safeParse({
      type: 'wake.verified',
      changed: true,
      timestamp: '2026-02-18T00:00:00.000Z',
      payload: {
        commandId: 'cmd-1',
        fullyQualifiedName: 'office-pc@home',
        status: 'confirmed',
        attempts: 8,
        elapsedMs: 24000,
      },
    });

    expect(result.success).toBe(true);
  });

  it('includes wake.verified in HOST_STATE_STREAM_MUTATING_EVENT_TYPES', () => {
    expect(HOST_STATE_STREAM_MUTATING_EVENT_TYPES).toContain('wake.verified');
  });

  it('rejects unknown host-state stream event types', () => {
    const result = hostStateStreamEventSchema.safeParse({
      type: 'custom.event',
      changed: true,
      timestamp: '2026-02-18T00:00:00.000Z',
    });

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hostPortScanResponseSchema
// ---------------------------------------------------------------------------

describe('hostPortScanResponseSchema', () => {
  it('accepts valid host port scan response', () => {
    expect(
      hostPortScanResponseSchema.safeParse({
        target: 'Office-Mac@Home',
        scannedAt: '2026-02-15T00:00:00.000Z',
        openPorts: [
          { port: 22, protocol: 'tcp', service: 'SSH' },
          { port: 443, protocol: 'tcp', service: 'HTTPS' },
        ],
        scan: {
          commandId: 'cmd-1',
          state: 'acknowledged',
          nodeId: 'node-1',
        },
      }).success
    ).toBe(true);
  });

  it('accepts empty open ports array', () => {
    expect(
      hostPortScanResponseSchema.safeParse({
        target: 'Office-Mac@Home',
        scannedAt: '2026-02-15T00:00:00.000Z',
        openPorts: [],
      }).success
    ).toBe(true);
  });

  it('rejects invalid port protocol', () => {
    expect(
      hostPortScanResponseSchema.safeParse({
        target: 'Office-Mac@Home',
        scannedAt: '2026-02-15T00:00:00.000Z',
        openPorts: [{ port: 80, protocol: 'udp', service: 'HTTP' }],
      }).success
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hostWakeScheduleSchema and related schedule schemas
// ---------------------------------------------------------------------------

describe('scheduleFrequencySchema', () => {
  it.each(['once', 'daily', 'weekly', 'weekdays', 'weekends'])('accepts "%s"', (frequency) => {
    expect(scheduleFrequencySchema.safeParse(frequency).success).toBe(true);
  });

  it('rejects unknown schedule frequency', () => {
    expect(scheduleFrequencySchema.safeParse('monthly').success).toBe(false);
  });
});

describe('hostWakeScheduleSchema', () => {
  const validSchedule = {
    id: 'schedule-1',
    hostFqn: 'Office-Mac@Home',
    hostName: 'Office-Mac',
    hostMac: '00:11:22:33:44:55',
    scheduledTime: '2026-02-15T09:00:00.000Z',
    frequency: 'daily',
    enabled: true,
    notifyOnWake: true,
    timezone: 'America/New_York',
    createdAt: '2026-02-15T00:00:00.000Z',
    updatedAt: '2026-02-15T00:00:00.000Z',
  };

  it('accepts a valid host wake schedule', () => {
    expect(hostWakeScheduleSchema.safeParse(validSchedule).success).toBe(true);
  });

  it('accepts optional trigger metadata', () => {
    expect(
      hostWakeScheduleSchema.safeParse({
        ...validSchedule,
        lastTriggered: '2026-02-15T08:00:00.000Z',
        nextTrigger: '2026-02-16T09:00:00.000Z',
      }).success
    ).toBe(true);
  });

  it('rejects invalid scheduled time format', () => {
    expect(
      hostWakeScheduleSchema.safeParse({
        ...validSchedule,
        scheduledTime: 'not-a-date',
      }).success
    ).toBe(false);
  });
});

describe('hostSchedulesResponseSchema', () => {
  it('accepts schedules response payload', () => {
    expect(
      hostSchedulesResponseSchema.safeParse({
        schedules: [
          {
            id: 'schedule-1',
            hostFqn: 'Office-Mac@Home',
            hostName: 'Office-Mac',
            hostMac: '00:11:22:33:44:55',
            scheduledTime: '2026-02-15T09:00:00.000Z',
            frequency: 'daily',
            enabled: true,
            notifyOnWake: true,
            timezone: 'UTC',
            createdAt: '2026-02-15T00:00:00.000Z',
            updatedAt: '2026-02-15T00:00:00.000Z',
          },
        ],
      }).success
    ).toBe(true);
  });
});

describe('createHostWakeScheduleRequestSchema', () => {
  it('accepts valid schedule create request', () => {
    expect(
      createHostWakeScheduleRequestSchema.safeParse({
        scheduledTime: '2026-02-15T09:00:00.000Z',
        frequency: 'weekly',
        enabled: true,
        notifyOnWake: false,
        timezone: 'UTC',
      }).success
    ).toBe(true);
  });

  it('rejects unknown fields', () => {
    expect(
      createHostWakeScheduleRequestSchema.safeParse({
        scheduledTime: '2026-02-15T09:00:00.000Z',
        frequency: 'daily',
        extra: 'nope',
      }).success
    ).toBe(false);
  });
});

describe('updateHostWakeScheduleRequestSchema', () => {
  it('accepts valid partial update request', () => {
    expect(
      updateHostWakeScheduleRequestSchema.safeParse({
        enabled: false,
      }).success
    ).toBe(true);
  });

  it('rejects empty update request', () => {
    expect(updateHostWakeScheduleRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('deleteHostWakeScheduleResponseSchema', () => {
  it('accepts valid delete response payload', () => {
    expect(
      deleteHostWakeScheduleResponseSchema.safeParse({
        success: true,
        id: 'schedule-1',
      }).success
    ).toBe(true);
  });

  it('rejects delete response without success=true', () => {
    expect(
      deleteHostWakeScheduleResponseSchema.safeParse({
        success: false,
        id: 'schedule-1',
      }).success
    ).toBe(false);
  });
});

describe('hostStatusHistoryEntrySchema', () => {
  it('accepts valid status transition entries', () => {
    expect(
      hostStatusHistoryEntrySchema.safeParse({
        hostFqn: 'desktop@Home%20Office-node-1',
        oldStatus: 'asleep',
        newStatus: 'awake',
        changedAt: '2026-02-18T18:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('rejects invalid status values', () => {
    expect(
      hostStatusHistoryEntrySchema.safeParse({
        hostFqn: 'desktop@Home%20Office-node-1',
        oldStatus: 'unknown',
        newStatus: 'awake',
        changedAt: '2026-02-18T18:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('hostStatusHistoryResponseSchema', () => {
  it('accepts valid host history response payloads', () => {
    expect(
      hostStatusHistoryResponseSchema.safeParse({
        hostFqn: 'desktop@Home%20Office-node-1',
        from: '2026-02-11T18:00:00.000Z',
        to: '2026-02-18T18:00:00.000Z',
        entries: [
          {
            hostFqn: 'desktop@Home%20Office-node-1',
            oldStatus: 'asleep',
            newStatus: 'awake',
            changedAt: '2026-02-18T17:00:00.000Z',
          },
        ],
      }).success,
    ).toBe(true);
  });
});

describe('hostUptimeSummarySchema', () => {
  it('accepts valid uptime summaries', () => {
    expect(
      hostUptimeSummarySchema.safeParse({
        hostFqn: 'desktop@Home%20Office-node-1',
        period: '7d',
        from: '2026-02-11T18:00:00.000Z',
        to: '2026-02-18T18:00:00.000Z',
        uptimePercentage: 99.5,
        awakeMs: 604500000,
        asleepMs: 4500000,
        transitions: 4,
        currentStatus: 'awake',
      }).success,
    ).toBe(true);
  });

  it('rejects summaries with invalid uptime percentages', () => {
    expect(
      hostUptimeSummarySchema.safeParse({
        hostFqn: 'desktop@Home%20Office-node-1',
        period: '7d',
        from: '2026-02-11T18:00:00.000Z',
        to: '2026-02-18T18:00:00.000Z',
        uptimePercentage: 120,
        awakeMs: 1,
        asleepMs: 0,
        transitions: 0,
        currentStatus: 'awake',
      }).success,
    ).toBe(false);
  });
});

describe('webhookEventTypeSchema', () => {
  it('accepts supported webhook event types', () => {
    expect(webhookEventTypeSchema.safeParse('host.awake').success).toBe(true);
    expect(webhookEventTypeSchema.safeParse('scan.complete').success).toBe(true);
  });

  it('rejects unknown webhook event types', () => {
    expect(webhookEventTypeSchema.safeParse('host.updated').success).toBe(false);
  });
});

describe('createWebhookRequestSchema', () => {
  it('accepts valid webhook create payloads', () => {
    expect(
      createWebhookRequestSchema.safeParse({
        url: 'https://example.com/hooks/woly',
        events: ['host.awake', 'host.asleep'],
        secret: 'shared-secret',
      }).success
    ).toBe(true);
  });

  it('rejects duplicate events', () => {
    expect(
      createWebhookRequestSchema.safeParse({
        url: 'https://example.com/hooks/woly',
        events: ['host.awake', 'host.awake'],
      }).success
    ).toBe(false);
  });
});

describe('webhookSubscriptionSchema', () => {
  it('accepts valid webhook subscription payloads', () => {
    expect(
      webhookSubscriptionSchema.safeParse({
        id: 'webhook-1',
        url: 'https://example.com/hooks/woly',
        events: ['host.awake'],
        hasSecret: true,
        createdAt: '2026-02-18T20:00:00.000Z',
        updatedAt: '2026-02-18T20:00:00.000Z',
      }).success
    ).toBe(true);
  });
});

describe('webhooksResponseSchema', () => {
  it('accepts list response payloads', () => {
    expect(
      webhooksResponseSchema.safeParse({
        webhooks: [
          {
            id: 'webhook-1',
            url: 'https://example.com/hooks/woly',
            events: ['host.awake'],
            hasSecret: false,
            createdAt: '2026-02-18T20:00:00.000Z',
            updatedAt: '2026-02-18T20:00:00.000Z',
          },
        ],
      }).success
    ).toBe(true);
  });
});

describe('webhookDeliveryLogSchema', () => {
  it('accepts valid delivery log payloads', () => {
    expect(
      webhookDeliveryLogSchema.safeParse({
        id: 1,
        webhookId: 'webhook-1',
        eventType: 'host.awake',
        attempt: 2,
        status: 'failed',
        responseStatus: 503,
        error: 'HTTP 503',
        payload: {
          event: 'host.awake',
        },
        createdAt: '2026-02-18T20:00:00.000Z',
      }).success
    ).toBe(true);
  });
});

describe('webhookDeliveriesResponseSchema', () => {
  it('accepts delivery log list payloads', () => {
    expect(
      webhookDeliveriesResponseSchema.safeParse({
        webhookId: 'webhook-1',
        deliveries: [
          {
            id: 1,
            webhookId: 'webhook-1',
            eventType: 'host.awake',
            attempt: 1,
            status: 'success',
            responseStatus: 204,
            error: null,
            payload: {
              event: 'host.awake',
            },
            createdAt: '2026-02-18T20:00:00.000Z',
          },
        ],
      }).success
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// outboundNodeMessageSchema (node → C&C)
// ---------------------------------------------------------------------------

describe('outboundNodeMessageSchema', () => {
  const baseMetadata = {
    version: '1.0.0',
    platform: 'linux',
    protocolVersion: PROTOCOL_VERSION,
    networkInfo: { subnet: '192.168.1.0/24', gateway: '192.168.1.1' },
  };

  describe('register', () => {
    it('accepts valid registration', () => {
      const msg = {
        type: 'register' as const,
        data: {
          nodeId: 'node-1',
          name: 'Lab Node',
          location: 'lab',
          metadata: baseMetadata,
        },
      };
      expect(outboundNodeMessageSchema.safeParse(msg).success).toBe(true);
    });

    it('accepts registration with optional authToken', () => {
      const msg = {
        type: 'register' as const,
        data: {
          nodeId: 'node-1',
          name: 'Lab Node',
          location: 'lab',
          authToken: 'secret',
          metadata: baseMetadata,
        },
      };
      expect(outboundNodeMessageSchema.safeParse(msg).success).toBe(true);
    });

    it('rejects registration with empty nodeId', () => {
      const msg = {
        type: 'register' as const,
        data: {
          nodeId: '',
          name: 'Lab Node',
          location: 'lab',
          metadata: baseMetadata,
        },
      };
      expect(outboundNodeMessageSchema.safeParse(msg).success).toBe(false);
    });

    it('rejects registration without metadata', () => {
      const msg = {
        type: 'register' as const,
        data: {
          nodeId: 'node-1',
          name: 'Lab Node',
          location: 'lab',
        },
      };
      expect(outboundNodeMessageSchema.safeParse(msg).success).toBe(false);
    });
  });

  describe('heartbeat', () => {
    it('accepts valid heartbeat', () => {
      const msg = {
        type: 'heartbeat' as const,
        data: { nodeId: 'node-1', timestamp: new Date().toISOString() },
      };
      expect(outboundNodeMessageSchema.safeParse(msg).success).toBe(true);
    });

    it('coerces ISO string to Date', () => {
      const msg = {
        type: 'heartbeat' as const,
        data: { nodeId: 'node-1', timestamp: '2025-01-01T00:00:00Z' },
      };
      const result = outboundNodeMessageSchema.safeParse(msg);
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as { data: { timestamp: Date } }).data.timestamp).toBeInstanceOf(Date);
      }
    });
  });

  describe('host-discovered', () => {
    it('accepts valid host discovery', () => {
      const msg = {
        type: 'host-discovered' as const,
        data: {
          nodeId: 'node-1',
          name: 'pc-1',
          mac: 'AA:BB:CC:DD:EE:FF',
          ip: '192.168.1.10',
          status: 'awake',
          lastSeen: '2025-01-01T00:00:00Z',
          discovered: 1,
        },
      };
      expect(outboundNodeMessageSchema.safeParse(msg).success).toBe(true);
    });
  });

  describe('host-updated', () => {
    it('accepts valid host update', () => {
      const msg = {
        type: 'host-updated' as const,
        data: {
          nodeId: 'node-1',
          name: 'pc-1',
          mac: 'AA:BB:CC:DD:EE:FF',
          ip: '192.168.1.10',
          status: 'asleep',
          lastSeen: null,
          discovered: 0,
        },
      };
      expect(outboundNodeMessageSchema.safeParse(msg).success).toBe(true);
    });
  });

  describe('host-removed', () => {
    it('accepts valid host removal', () => {
      const msg = {
        type: 'host-removed' as const,
        data: { nodeId: 'node-1', name: 'pc-1' },
      };
      expect(outboundNodeMessageSchema.safeParse(msg).success).toBe(true);
    });

    it('rejects removal with empty name', () => {
      const msg = {
        type: 'host-removed' as const,
        data: { nodeId: 'node-1', name: '' },
      };
      expect(outboundNodeMessageSchema.safeParse(msg).success).toBe(false);
    });
  });

  describe('scan-complete', () => {
    it('accepts valid scan completion', () => {
      const msg = {
        type: 'scan-complete' as const,
        data: { nodeId: 'node-1', hostCount: 5 },
      };
      expect(outboundNodeMessageSchema.safeParse(msg).success).toBe(true);
    });

    it('accepts zero host count', () => {
      const msg = {
        type: 'scan-complete' as const,
        data: { nodeId: 'node-1', hostCount: 0 },
      };
      expect(outboundNodeMessageSchema.safeParse(msg).success).toBe(true);
    });

    it('rejects negative host count', () => {
      const msg = {
        type: 'scan-complete' as const,
        data: { nodeId: 'node-1', hostCount: -1 },
      };
      expect(outboundNodeMessageSchema.safeParse(msg).success).toBe(false);
    });
  });

  describe('command-result', () => {
    it('accepts successful command result', () => {
      const msg = {
        type: 'command-result' as const,
        data: {
          nodeId: 'node-1',
          commandId: 'cmd-1',
          success: true,
          message: 'WoL packet sent',
          timestamp: new Date().toISOString(),
        },
      };
      expect(outboundNodeMessageSchema.safeParse(msg).success).toBe(true);
    });

    it('accepts failed command result with error', () => {
      const msg = {
        type: 'command-result' as const,
        data: {
          nodeId: 'node-1',
          commandId: 'cmd-2',
          success: false,
          error: 'Host not found',
          timestamp: new Date().toISOString(),
        },
      };
      expect(outboundNodeMessageSchema.safeParse(msg).success).toBe(true);
    });

    it('accepts command result with host ping payload', () => {
      const msg = {
        type: 'command-result' as const,
        data: {
          nodeId: 'node-1',
          commandId: 'cmd-ping-1',
          success: true,
          hostPing: {
            hostName: 'office-pc',
            mac: 'AA:BB:CC:DD:EE:FF',
            ip: '192.168.1.20',
            reachable: true,
            status: 'awake' as const,
            latencyMs: 12,
            checkedAt: new Date().toISOString(),
          },
          timestamp: new Date().toISOString(),
        },
      };
      expect(outboundNodeMessageSchema.safeParse(msg).success).toBe(true);
    });

    it('accepts command result with host port scan payload', () => {
      const msg = {
        type: 'command-result' as const,
        data: {
          nodeId: 'node-1',
          commandId: 'cmd-port-scan-1',
          success: true,
          hostPortScan: {
            hostName: 'office-pc',
            mac: 'AA:BB:CC:DD:EE:FF',
            ip: '192.168.1.20',
            scannedAt: new Date().toISOString(),
            openPorts: [
              { port: 22, protocol: 'tcp' as const, service: 'SSH' },
              { port: 443, protocol: 'tcp' as const, service: 'HTTPS' },
            ],
          },
          timestamp: new Date().toISOString(),
        },
      };
      expect(outboundNodeMessageSchema.safeParse(msg).success).toBe(true);
    });

    it('accepts command result with wake verification payload', () => {
      const msg = {
        type: 'command-result' as const,
        data: {
          nodeId: 'node-1',
          commandId: 'cmd-wake-verify-1',
          success: true,
          wakeVerification: {
            status: 'confirmed',
            attempts: 8,
            elapsedMs: 24000,
            source: 'ping',
            startedAt: '2026-02-18T00:00:00.000Z',
            confirmedAt: '2026-02-18T00:00:24.000Z',
          },
          timestamp: new Date().toISOString(),
        },
      };
      expect(outboundNodeMessageSchema.safeParse(msg).success).toBe(true);
    });

    it('accepts command result with timeout wake verification', () => {
      const msg = {
        type: 'command-result' as const,
        data: {
          nodeId: 'node-1',
          commandId: 'cmd-wake-verify-2',
          success: true,
          wakeVerification: {
            status: 'timeout',
            attempts: 40,
            elapsedMs: 120000,
            startedAt: '2026-02-18T00:00:00.000Z',
            confirmedAt: null,
          },
          timestamp: new Date().toISOString(),
        },
      };
      expect(outboundNodeMessageSchema.safeParse(msg).success).toBe(true);
    });

    it('rejects command result without commandId', () => {
      const msg = {
        type: 'command-result' as const,
        data: {
          nodeId: 'node-1',
          success: true,
          timestamp: new Date().toISOString(),
        },
      };
      expect(outboundNodeMessageSchema.safeParse(msg).success).toBe(false);
    });
  });

  it('rejects unknown message type', () => {
    const msg = { type: 'unknown', data: {} };
    expect(outboundNodeMessageSchema.safeParse(msg).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// inboundCncCommandSchema (C&C → node)
// ---------------------------------------------------------------------------

describe('inboundCncCommandSchema', () => {
  describe('registered', () => {
    it('accepts valid registration ack', () => {
      const cmd = {
        type: 'registered' as const,
        data: { nodeId: 'node-1', heartbeatInterval: 30000 },
      };
      expect(inboundCncCommandSchema.safeParse(cmd).success).toBe(true);
    });

    it('accepts registration ack with protocolVersion', () => {
      const cmd = {
        type: 'registered' as const,
        data: { nodeId: 'node-1', heartbeatInterval: 30000, protocolVersion: '1.0.0' },
      };
      expect(inboundCncCommandSchema.safeParse(cmd).success).toBe(true);
    });

    it('rejects zero heartbeat interval', () => {
      const cmd = {
        type: 'registered' as const,
        data: { nodeId: 'node-1', heartbeatInterval: 0 },
      };
      expect(inboundCncCommandSchema.safeParse(cmd).success).toBe(false);
    });

    it('rejects negative heartbeat interval', () => {
      const cmd = {
        type: 'registered' as const,
        data: { nodeId: 'node-1', heartbeatInterval: -1000 },
      };
      expect(inboundCncCommandSchema.safeParse(cmd).success).toBe(false);
    });
  });

  describe('wake', () => {
    it('accepts valid wake command', () => {
      const cmd = {
        type: 'wake' as const,
        commandId: 'cmd-1',
        data: { hostName: 'office-pc', mac: 'AA:BB:CC:DD:EE:FF' },
      };
      expect(inboundCncCommandSchema.safeParse(cmd).success).toBe(true);
    });

    it('rejects wake without mac', () => {
      const cmd = {
        type: 'wake' as const,
        commandId: 'cmd-1',
        data: { hostName: 'office-pc' },
      };
      expect(inboundCncCommandSchema.safeParse(cmd).success).toBe(false);
    });

    it('rejects wake without commandId', () => {
      const cmd = {
        type: 'wake' as const,
        data: { hostName: 'office-pc', mac: 'AA:BB:CC:DD:EE:FF' },
      };
      expect(inboundCncCommandSchema.safeParse(cmd).success).toBe(false);
    });

    it('accepts wake command with verify options', () => {
      const cmd = {
        type: 'wake' as const,
        commandId: 'cmd-verify-1',
        data: {
          hostName: 'office-pc',
          mac: 'AA:BB:CC:DD:EE:FF',
          verify: { timeoutMs: 120000, pollIntervalMs: 3000 },
        },
      };
      expect(inboundCncCommandSchema.safeParse(cmd).success).toBe(true);
    });

    it('accepts wake command without verify options (optional)', () => {
      const cmd = {
        type: 'wake' as const,
        commandId: 'cmd-noverify',
        data: { hostName: 'office-pc', mac: 'AA:BB:CC:DD:EE:FF' },
      };
      expect(inboundCncCommandSchema.safeParse(cmd).success).toBe(true);
    });

    it('accepts wake command with custom wolPort', () => {
      const cmd = {
        type: 'wake' as const,
        commandId: 'cmd-custom-port',
        data: { hostName: 'office-pc', mac: 'AA:BB:CC:DD:EE:FF', wolPort: 7 },
      };
      expect(inboundCncCommandSchema.safeParse(cmd).success).toBe(true);
    });

    it('rejects wake command with invalid wolPort', () => {
      const cmd = {
        type: 'wake' as const,
        commandId: 'cmd-invalid-port',
        data: { hostName: 'office-pc', mac: 'AA:BB:CC:DD:EE:FF', wolPort: 0 },
      };
      expect(inboundCncCommandSchema.safeParse(cmd).success).toBe(false);
    });
  });

  describe('scan', () => {
    it('accepts immediate scan', () => {
      const cmd = {
        type: 'scan' as const,
        commandId: 'cmd-1',
        data: { immediate: true },
      };
      expect(inboundCncCommandSchema.safeParse(cmd).success).toBe(true);
    });

    it('accepts non-immediate scan', () => {
      const cmd = {
        type: 'scan' as const,
        commandId: 'cmd-1',
        data: { immediate: false },
      };
      expect(inboundCncCommandSchema.safeParse(cmd).success).toBe(true);
    });
  });

  describe('scan-host-ports', () => {
    it('accepts valid scan-host-ports command', () => {
      const cmd = {
        type: 'scan-host-ports' as const,
        commandId: 'cmd-port-scan-1',
        data: {
          hostName: 'office-pc',
          mac: 'AA:BB:CC:DD:EE:FF',
          ip: '192.168.1.20',
          ports: [22, 80, 443],
          timeoutMs: 300,
        },
      };
      expect(inboundCncCommandSchema.safeParse(cmd).success).toBe(true);
    });

    it('rejects scan-host-ports command with out-of-range port', () => {
      const cmd = {
        type: 'scan-host-ports' as const,
        commandId: 'cmd-port-scan-2',
        data: {
          hostName: 'office-pc',
          mac: 'AA:BB:CC:DD:EE:FF',
          ip: '192.168.1.20',
          ports: [0, 22],
        },
      };
      expect(inboundCncCommandSchema.safeParse(cmd).success).toBe(false);
    });
  });

  describe('update-host', () => {
    it('accepts update with only name', () => {
      const cmd = {
        type: 'update-host' as const,
        commandId: 'cmd-1',
        data: { name: 'new-name' },
      };
      expect(inboundCncCommandSchema.safeParse(cmd).success).toBe(true);
    });

    it('accepts update with all fields', () => {
      const cmd = {
        type: 'update-host' as const,
        commandId: 'cmd-1',
        data: {
          currentName: 'old-name',
          name: 'new-name',
          mac: 'AA:BB:CC:DD:EE:FF',
          ip: '192.168.1.50',
          wolPort: 7,
          status: 'awake' as const,
          secondaryMacs: ['11:22:33:44:55:66'],
          notes: 'Renamed workstation',
          tags: ['desk', 'critical'],
        },
      };
      expect(inboundCncCommandSchema.safeParse(cmd).success).toBe(true);
    });

    it('accepts update with secondaryMacs only', () => {
      const cmd = {
        type: 'update-host' as const,
        commandId: 'cmd-1',
        data: {
          name: 'pc',
          secondaryMacs: ['11:22:33:44:55:66'],
        },
      };
      expect(inboundCncCommandSchema.safeParse(cmd).success).toBe(true);
    });

    it('rejects update with invalid wolPort', () => {
      const cmd = {
        type: 'update-host' as const,
        commandId: 'cmd-1',
        data: { name: 'pc', wolPort: 65536 },
      };
      expect(inboundCncCommandSchema.safeParse(cmd).success).toBe(false);
    });

    it('rejects update with invalid status', () => {
      const cmd = {
        type: 'update-host' as const,
        commandId: 'cmd-1',
        data: { name: 'pc', status: 'unknown' },
      };
      expect(inboundCncCommandSchema.safeParse(cmd).success).toBe(false);
    });
  });

  describe('delete-host', () => {
    it('accepts valid delete', () => {
      const cmd = {
        type: 'delete-host' as const,
        commandId: 'cmd-1',
        data: { name: 'old-pc' },
      };
      expect(inboundCncCommandSchema.safeParse(cmd).success).toBe(true);
    });

    it('rejects delete with empty name', () => {
      const cmd = {
        type: 'delete-host' as const,
        commandId: 'cmd-1',
        data: { name: '' },
      };
      expect(inboundCncCommandSchema.safeParse(cmd).success).toBe(false);
    });
  });

  describe('ping-host', () => {
    it('accepts valid ping-host command', () => {
      const cmd = {
        type: 'ping-host' as const,
        commandId: 'cmd-1',
        data: {
          hostName: 'office-pc',
          mac: 'AA:BB:CC:DD:EE:FF',
          ip: '192.168.1.20',
        },
      };
      expect(inboundCncCommandSchema.safeParse(cmd).success).toBe(true);
    });

    it('rejects ping-host without ip', () => {
      const cmd = {
        type: 'ping-host' as const,
        commandId: 'cmd-1',
        data: {
          hostName: 'office-pc',
          mac: 'AA:BB:CC:DD:EE:FF',
        },
      };
      expect(inboundCncCommandSchema.safeParse(cmd).success).toBe(false);
    });
  });

  describe('ping', () => {
    it('accepts valid ping', () => {
      const cmd = {
        type: 'ping' as const,
        data: { timestamp: new Date().toISOString() },
      };
      expect(inboundCncCommandSchema.safeParse(cmd).success).toBe(true);
    });

    it('coerces timestamp string to Date', () => {
      const cmd = {
        type: 'ping' as const,
        data: { timestamp: '2025-06-01T12:00:00Z' },
      };
      const result = inboundCncCommandSchema.safeParse(cmd);
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as { data: { timestamp: Date } }).data.timestamp).toBeInstanceOf(Date);
      }
    });
  });

  describe('error', () => {
    it('accepts valid error', () => {
      const cmd = {
        type: 'error' as const,
        message: 'Invalid protocol payload',
      };
      expect(inboundCncCommandSchema.safeParse(cmd).success).toBe(true);
    });

    it('rejects error with empty message', () => {
      const cmd = {
        type: 'error' as const,
        message: '',
      };
      expect(inboundCncCommandSchema.safeParse(cmd).success).toBe(false);
    });
  });

  it('rejects unknown command type', () => {
    const cmd = { type: 'shutdown', data: {} };
    expect(inboundCncCommandSchema.safeParse(cmd).success).toBe(false);
  });
});
