import {
  cncCapabilitiesResponseSchema,
  cncCapabilityDescriptorSchema,
  createHostWakeScheduleRequestSchema,
  deleteHostWakeScheduleResponseSchema,
  hostPortScanResponseSchema,
  hostSchedulesResponseSchema,
  hostWakeScheduleSchema,
  hostSchema,
  hostStatusSchema,
  scheduleFrequencySchema,
  commandStateSchema,
  errorResponseSchema,
  outboundNodeMessageSchema,
  updateHostWakeScheduleRequestSchema,
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
          commandStatusStreaming: { supported: false, transport: null },
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
          status: 'awake' as const,
          notes: 'Renamed workstation',
          tags: ['desk', 'critical'],
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
