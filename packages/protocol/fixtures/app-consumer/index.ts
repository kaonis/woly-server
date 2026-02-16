import type {
  CncCapabilitiesResponse,
  Host,
  HostPortScanResponse,
  WakeSchedule,
} from '@kaonis/woly-protocol';
import {
  cncCapabilitiesResponseSchema,
  hostPortScanResponseSchema,
  wakeScheduleSchema,
} from '@kaonis/woly-protocol';

const capabilities: CncCapabilitiesResponse = {
  apiVersion: '1.0.0',
  protocolVersion: '1.0.0',
  supportedProtocolVersions: ['1.0.0'],
  capabilities: {
    scan: true,
    notesTagsPersistence: true,
    schedulesApi: true,
    commandStatusStreaming: false,
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

const schedule: WakeSchedule = {
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
  lastTriggered: null,
  nextTrigger: '2026-02-17T08:00:00.000Z',
};

void cncCapabilitiesResponseSchema.parse(capabilities);
void hostPortScanResponseSchema.parse(scanResponse);
void wakeScheduleSchema.parse(schedule);
