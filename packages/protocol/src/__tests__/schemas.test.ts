import {
  hostSchema,
  hostStatusSchema,
  cncCapabilitiesResponseSchema,
  cncFeatureCapabilitiesSchema,
  hostPortSchema,
  hostPortScanResponseSchema,
  scheduleFrequencySchema,
  wakeScheduleSchema,
  wakeScheduleListResponseSchema,
  createWakeScheduleRequestSchema,
  updateWakeScheduleRequestSchema,
  commandStateSchema,
  errorResponseSchema,
  outboundNodeMessageSchema,
  inboundCncCommandSchema,
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

  it('accepts host with null pingResponsive', () => {
    expect(hostSchema.safeParse({ ...validHost, pingResponsive: null }).success).toBe(true);
  });

  it('accepts host without pingResponsive (optional)', () => {
    const { pingResponsive: _, ...withoutPing } = { ...validHost, pingResponsive: 1 };
    expect(hostSchema.safeParse(withoutPing).success).toBe(true);
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
// cncCapabilitiesResponseSchema
// ---------------------------------------------------------------------------

describe('cncCapabilitiesResponseSchema', () => {
  it('accepts valid capabilities response', () => {
    const result = cncCapabilitiesResponseSchema.safeParse({
      apiVersion: '1.0.0',
      protocolVersion: PROTOCOL_VERSION,
      supportedProtocolVersions: [PROTOCOL_VERSION],
      capabilities: {
        scan: true,
        notesTagsPersistence: true,
        schedulesApi: false,
        commandStatusStreaming: false,
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects response without required feature flags', () => {
    const result = cncCapabilitiesResponseSchema.safeParse({
      apiVersion: '1.0.0',
      protocolVersion: PROTOCOL_VERSION,
      supportedProtocolVersions: [PROTOCOL_VERSION],
      capabilities: {
        scan: true,
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty supported protocol version list', () => {
    const result = cncCapabilitiesResponseSchema.safeParse({
      apiVersion: '1.0.0',
      protocolVersion: PROTOCOL_VERSION,
      supportedProtocolVersions: [],
      capabilities: {
        scan: true,
        notesTagsPersistence: true,
        schedulesApi: false,
        commandStatusStreaming: false,
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('cncFeatureCapabilitiesSchema', () => {
  it('accepts explicit boolean values for all features', () => {
    const result = cncFeatureCapabilitiesSchema.safeParse({
      scan: false,
      notesTagsPersistence: true,
      schedulesApi: false,
      commandStatusStreaming: true,
    });
    expect(result.success).toBe(true);
  });
});

describe('hostPortSchema', () => {
  it('accepts valid host port records', () => {
    expect(hostPortSchema.safeParse({ port: 22, protocol: 'tcp', service: 'SSH' }).success).toBe(true);
  });

  it('rejects non-positive ports', () => {
    expect(hostPortSchema.safeParse({ port: 0, protocol: 'tcp', service: 'SSH' }).success).toBe(false);
  });
});

describe('hostPortScanResponseSchema', () => {
  it('accepts valid host port scan payloads', () => {
    const result = hostPortScanResponseSchema.safeParse({
      target: 'office-pc@home-node',
      scannedAt: '2026-02-16T08:00:00.000Z',
      openPorts: [
        { port: 22, protocol: 'tcp', service: 'SSH' },
        { port: 443, protocol: 'tcp', service: 'HTTPS' },
      ],
      scan: {
        commandId: 'cmd-1',
        state: 'acknowledged',
        nodeId: 'node-1',
      },
      correlationId: 'corr-1',
    });

    expect(result.success).toBe(true);
  });

  it('rejects invalid scan state values', () => {
    const result = hostPortScanResponseSchema.safeParse({
      target: 'office-pc@home-node',
      scannedAt: '2026-02-16T08:00:00.000Z',
      openPorts: [],
      scan: {
        state: 'unknown',
      },
    });

    expect(result.success).toBe(false);
  });
});

describe('scheduleFrequencySchema', () => {
  it.each(['once', 'daily', 'weekly', 'weekdays', 'weekends'])('accepts "%s"', (value) => {
    expect(scheduleFrequencySchema.safeParse(value).success).toBe(true);
  });

  it('rejects unsupported values', () => {
    expect(scheduleFrequencySchema.safeParse('monthly').success).toBe(false);
  });
});

describe('wakeScheduleSchema', () => {
  const validSchedule = {
    id: 'sched-1',
    hostName: 'office-pc',
    hostMac: 'AA:BB:CC:DD:EE:FF',
    hostFqn: 'office-pc@home-node',
    scheduledTime: '2026-02-16T08:00:00.000Z',
    timezone: 'America/New_York',
    frequency: 'daily',
    enabled: true,
    notifyOnWake: true,
    createdAt: '2026-02-15T08:00:00.000Z',
    updatedAt: '2026-02-15T08:00:00.000Z',
    lastTriggered: null,
    nextTrigger: '2026-02-16T08:00:00.000Z',
  };

  it('accepts valid schedule payload', () => {
    expect(wakeScheduleSchema.safeParse(validSchedule).success).toBe(true);
  });

  it('rejects invalid timestamp fields', () => {
    expect(
      wakeScheduleSchema.safeParse({ ...validSchedule, scheduledTime: 'not-a-date' }).success,
    ).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(wakeScheduleSchema.safeParse({ ...validSchedule, extra: true }).success).toBe(false);
  });
});

describe('wakeScheduleListResponseSchema', () => {
  it('accepts schedule list responses', () => {
    const result = wakeScheduleListResponseSchema.safeParse({
      schedules: [
        {
          id: 'sched-1',
          hostName: 'office-pc',
          hostMac: 'AA:BB:CC:DD:EE:FF',
          hostFqn: 'office-pc@home-node',
          scheduledTime: '2026-02-16T08:00:00.000Z',
          timezone: 'UTC',
          frequency: 'daily',
          enabled: true,
          notifyOnWake: true,
          createdAt: '2026-02-15T08:00:00.000Z',
          updatedAt: '2026-02-15T08:00:00.000Z',
          lastTriggered: null,
          nextTrigger: null,
        },
      ],
    });

    expect(result.success).toBe(true);
  });
});

describe('createWakeScheduleRequestSchema', () => {
  it('applies defaults for timezone and flags', () => {
    const result = createWakeScheduleRequestSchema.safeParse({
      hostName: 'office-pc',
      hostMac: 'AA:BB:CC:DD:EE:FF',
      hostFqn: 'office-pc@home-node',
      scheduledTime: '2026-02-16T08:00:00.000Z',
      frequency: 'daily',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timezone).toBe('UTC');
      expect(result.data.enabled).toBe(true);
      expect(result.data.notifyOnWake).toBe(true);
    }
  });

  it('rejects malformed payloads', () => {
    expect(
      createWakeScheduleRequestSchema.safeParse({
        hostName: '',
        hostMac: 'AA:BB:CC:DD:EE:FF',
        hostFqn: 'office-pc@home-node',
        scheduledTime: 'invalid-date',
        frequency: 'daily',
      }).success,
    ).toBe(false);
  });
});

describe('updateWakeScheduleRequestSchema', () => {
  it('accepts partial updates', () => {
    expect(updateWakeScheduleRequestSchema.safeParse({ enabled: false }).success).toBe(true);
  });

  it('rejects empty payloads', () => {
    expect(updateWakeScheduleRequestSchema.safeParse({}).success).toBe(false);
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
          status: 'awake' as const,
          notes: 'wake before backup',
          tags: ['infra', 'macos'],
        },
      };
      expect(inboundCncCommandSchema.safeParse(cmd).success).toBe(true);
    });

    it('accepts nullable notes/tags metadata fields', () => {
      const cmd = {
        type: 'update-host' as const,
        commandId: 'cmd-1',
        data: {
          name: 'new-name',
          notes: null,
          tags: null,
        },
      };
      expect(inboundCncCommandSchema.safeParse(cmd).success).toBe(true);
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
