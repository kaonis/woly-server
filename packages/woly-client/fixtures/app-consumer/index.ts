import { CncApi, NodeAgentApi } from '@kaonis/woly-client';

CncApi.OpenAPI.BASE = 'http://localhost:8080';
NodeAgentApi.OpenAPI.BASE = 'http://localhost:8082';

const operatorTokenPromise = CncApi.AuthenticationService.postApiAuthToken({
  role: 'operator',
  sub: 'mobile-consumer',
});

const hostsPromise = CncApi.HostsService.getApiHosts();
const nodeAgentHealthPromise = NodeAgentApi.HealthService.getHealth();

void operatorTokenPromise;
void hostsPromise;
void nodeAgentHealthPromise;
