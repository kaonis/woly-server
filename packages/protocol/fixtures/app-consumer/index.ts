import type {
  CncCapabilitiesResponse,
  Host,
  HostPortScanResponse,
  HostWakeSchedule,
} from '@kaonis/woly-protocol';
import {
  cncCapabilitiesResponseSchema,
  hostPortScanResponseSchema,
  hostWakeScheduleSchema,
} from '@kaonis/woly-protocol';

const capabilities: CncCapabilitiesResponse = {
  mode: 'cnc',
  versions: {
    cncApi: '1.0.0',
    protocol: '1.2.0',
  },
  capabilities: {
    scan: { supported: true },
    notesTags: { supported: true, persistence: 'backend' },
    schedules: { supported: true, routes: ['/api/hosts/:fqn/schedules'] },
    commandStatusStreaming: { supported: false, transport: null },
  },
};

const host: Host = {
  name: 'office-pc',
  mac: 'AA:BB:CC:DD:EE:FF',
  ip: '192.168.1.10',
  status: 'awake',
  lastSeen: '2026-02-16T08:00:00.000Z',
  discovered: 1,
};

const scanResponse: HostPortScanResponse = {
  target: `${host.name}@home-node`,
  scannedAt: '2026-02-16T08:00:00.000Z',
  openPorts: [{ port: 22, protocol: 'tcp', service: 'SSH' }],
  scan: {
    commandId: 'cmd-1',
    state: 'acknowledged',
    nodeId: 'home-node',
  },
};

const schedule: HostWakeSchedule = {
  id: 'sched-1',
  hostName: host.name,
  hostMac: host.mac,
  hostFqn: `${host.name}@home-node`,
  scheduledTime: '2026-02-16T08:00:00.000Z',
  timezone: 'UTC',
  frequency: 'daily',
  enabled: true,
  notifyOnWake: true,
  createdAt: '2026-02-15T08:00:00.000Z',
  updatedAt: '2026-02-15T08:00:00.000Z',
  lastTriggered: '2026-02-16T08:00:00.000Z',
  nextTrigger: '2026-02-17T08:00:00.000Z',
};

void cncCapabilitiesResponseSchema.parse(capabilities);
void hostPortScanResponseSchema.parse(scanResponse);
void hostWakeScheduleSchema.parse(schedule);
