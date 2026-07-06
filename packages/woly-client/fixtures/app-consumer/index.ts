import { CncApi, NodeAgentApi } from '@kaonis/woly-client';

CncApi.OpenAPI.BASE = 'http://localhost:8080';
NodeAgentApi.OpenAPI.BASE = 'http://localhost:8082';

const operatorTokenPromise = CncApi.AuthenticationService.postApiAuthToken({
  role: 'operator',
  sub: 'mobile-consumer',
});

const capabilitiesPromise = CncApi.MetaService.getApiCapabilities().then((capabilities) => {
  const protocolVersion: string = capabilities.versions.protocol;
  const sleepSupported: boolean = capabilities.capabilities.sleep.supported;
  const macVendorWindowMs: number | null | undefined =
    capabilities.rateLimits?.macVendorLookup.windowMs;

  void protocolVersion;
  void sleepSupported;
  void macVendorWindowMs;
  return capabilities;
});

const hostsPromise = CncApi.HostsService.getApiHosts().then((response) => {
  const firstHostIdentity: string | undefined = response.hosts[0]?.fullyQualifiedName;
  const firstHostTransport: 'ssh' | undefined = response.hosts[0]?.powerControl?.transport;

  void firstHostIdentity;
  void firstHostTransport;
  return response;
});

const nodesPromise = CncApi.NodesService.getApiNodes().then((response) => {
  const firstNodeProtocolVersion: string | undefined = response.nodes[0]?.metadata.protocolVersion;
  const firstNodeCapabilities: string[] | undefined = response.nodes[0]?.capabilities;

  void firstNodeProtocolVersion;
  void firstNodeCapabilities;
  return response;
});

const wakePromise = CncApi.HostsService.postApiHostsWakeup(
  'Office-Mac@Home',
  'wake-idempotency-key',
  { verify: true },
);
const sleepPromise = CncApi.HostsService.postApiHostsSleep(
  'Office-Mac@Home',
  { confirm: 'sleep' },
  'sleep-idempotency-key',
);
const shutdownPromise = CncApi.HostsService.postApiHostsShutdown(
  'Office-Mac@Home',
  { confirm: 'shutdown' },
  'shutdown-idempotency-key',
);
const pingPromise = CncApi.HostsService.getApiHostsPing('Office-Mac@Home');
const scanPromise = CncApi.HostsService.postApiHostsScan();
const portScanPromise = CncApi.HostsService.getApiHostsScanPorts('Office-Mac@Home');
const cncMergeMacPromise = CncApi.HostsService.putApiHostsMergeMac(
  'Office-Mac@Home',
  {
    mac: '80:6D:97:60:39:09',
    makePrimary: false,
    sourceFqn: 'Office-Mac-Old@Home',
    deleteSourceHost: true,
  },
  'merge-idempotency-key',
).then((response) => {
  const success: boolean = response.success;
  const primaryMac: string = response.primaryMac;
  const firstSecondaryMac: string | undefined = response.secondaryMacs[0];

  void success;
  void primaryMac;
  void firstSecondaryMac;
  return response;
});
const cncUnmergeMacPromise = CncApi.HostsService.deleteApiHostsMergeMac(
  'Office-Mac@Home',
  '80:6D:97:60:39:09',
  'unmerge-idempotency-key',
).then((response) => {
  const message: string = response.message;
  const commandId: string | undefined = response.commandId;

  void message;
  void commandId;
  return response;
});
const macVendorPromise = CncApi.HostsService.getApiHostsMacVendor('80:6D:97:60:39:08');
const schedulesPromise = CncApi.HostsService.getApiSchedules();
const hostSchedulesPromise = CncApi.HostsService.getApiHostsSchedules('Office-Mac@Home');
const createSchedulePromise = CncApi.HostsService.postApiHostsSchedules('Office-Mac@Home', {
  scheduledTime: '2026-02-20T10:00:00.000Z',
  frequency: 'daily',
  timezone: 'UTC',
});
const updateSchedulePromise = CncApi.HostsService.putApiHostsSchedules('schedule-1', {
  enabled: false,
});
const deleteSchedulePromise = CncApi.HostsService.deleteApiHostsSchedules('schedule-1');
const nodeAgentHealthPromise = NodeAgentApi.HealthService.getHealth();
const nodeAgentMergeMacPromise = NodeAgentApi.HostsService.putHostsMergeMac('Office-Mac', {
  mac: '80:6D:97:60:39:09',
  makePrimary: false,
  sourceHostName: 'Office-Mac-Old',
  deleteSourceHost: true,
}).then((host) => {
  const primaryMac: string = host.mac;
  const firstSecondaryMac: string | undefined = host.secondaryMacs?.[0];

  void primaryMac;
  void firstSecondaryMac;
  return host;
});
const nodeAgentUnmergeMacPromise = NodeAgentApi.HostsService.deleteHostsMergeMac(
  'Office-Mac',
  '80:6D:97:60:39:09',
).then((host) => {
  const primaryMac: string = host.mac;

  void primaryMac;
  return host;
});

void operatorTokenPromise;
void capabilitiesPromise;
void hostsPromise;
void nodesPromise;
void wakePromise;
void sleepPromise;
void shutdownPromise;
void pingPromise;
void scanPromise;
void portScanPromise;
void cncMergeMacPromise;
void cncUnmergeMacPromise;
void macVendorPromise;
void schedulesPromise;
void hostSchedulesPromise;
void createSchedulePromise;
void updateSchedulePromise;
void deleteSchedulePromise;
void nodeAgentHealthPromise;
void nodeAgentMergeMacPromise;
void nodeAgentUnmergeMacPromise;
