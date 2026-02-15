import { Gauge, Registry, collectDefaultMetrics } from 'prom-client';
import type { RuntimeMetricsSnapshot } from './runtimeMetrics';

const registry = new Registry();
registry.setDefaultLabels({ app: 'woly-cnc' });
collectDefaultMetrics({ register: registry, prefix: 'woly_cnc_process_' });

const nodesConnectedGauge = new Gauge({
  name: 'woly_cnc_nodes_connected',
  help: 'Current number of connected nodes',
  registers: [registry],
});

const nodesPeakConnectedGauge = new Gauge({
  name: 'woly_cnc_nodes_peak_connected',
  help: 'Peak number of simultaneously connected nodes since process start',
  registers: [registry],
});

const invalidPayloadTotalGauge = new Gauge({
  name: 'woly_cnc_protocol_invalid_payload_total',
  help: 'Total number of invalid protocol payloads observed',
  registers: [registry],
});

const commandsActiveGauge = new Gauge({
  name: 'woly_cnc_commands_active',
  help: 'Current number of active commands',
  registers: [registry],
});

const commandsDispatchedGauge = new Gauge({
  name: 'woly_cnc_commands_dispatched_total',
  help: 'Total number of commands dispatched',
  registers: [registry],
});

const commandsAcknowledgedGauge = new Gauge({
  name: 'woly_cnc_commands_acknowledged_total',
  help: 'Total number of commands acknowledged successfully',
  registers: [registry],
});

const commandsFailedGauge = new Gauge({
  name: 'woly_cnc_commands_failed_total',
  help: 'Total number of commands marked failed',
  registers: [registry],
});

const commandsTimedOutGauge = new Gauge({
  name: 'woly_cnc_commands_timed_out_total',
  help: 'Total number of commands that timed out',
  registers: [registry],
});

const commandTimeoutRateGauge = new Gauge({
  name: 'woly_cnc_command_timeout_rate',
  help: 'Fraction of completed commands that timed out',
  registers: [registry],
});

const commandAvgLatencyGauge = new Gauge({
  name: 'woly_cnc_command_avg_latency_ms',
  help: 'Average command latency in milliseconds',
  registers: [registry],
});

const commandLastLatencyGauge = new Gauge({
  name: 'woly_cnc_command_last_latency_ms',
  help: 'Most recent command latency in milliseconds',
  registers: [registry],
});

const commandByTypeGauge = new Gauge({
  name: 'woly_cnc_commands_by_type',
  help: 'Command metrics by command type and state',
  labelNames: ['type', 'state'],
  registers: [registry],
});

export function updatePrometheusRuntimeMetrics(snapshot: RuntimeMetricsSnapshot): void {
  nodesConnectedGauge.set(snapshot.nodes.connected);
  nodesPeakConnectedGauge.set(snapshot.nodes.peakConnected);
  invalidPayloadTotalGauge.set(snapshot.protocol.invalidPayloadTotal);

  commandsActiveGauge.set(snapshot.commands.active);
  commandsDispatchedGauge.set(snapshot.commands.dispatched);
  commandsAcknowledgedGauge.set(snapshot.commands.acknowledged);
  commandsFailedGauge.set(snapshot.commands.failed);
  commandsTimedOutGauge.set(snapshot.commands.timedOut);
  commandTimeoutRateGauge.set(snapshot.commands.timeoutRate);
  commandAvgLatencyGauge.set(snapshot.commands.avgLatencyMs);
  commandLastLatencyGauge.set(snapshot.commands.lastLatencyMs ?? 0);

  commandByTypeGauge.reset();
  for (const [commandType, metrics] of Object.entries(snapshot.commands.byType)) {
    commandByTypeGauge.set({ type: commandType, state: 'dispatched' }, metrics.dispatched);
    commandByTypeGauge.set({ type: commandType, state: 'acknowledged' }, metrics.acknowledged);
    commandByTypeGauge.set({ type: commandType, state: 'failed' }, metrics.failed);
    commandByTypeGauge.set({ type: commandType, state: 'timed_out' }, metrics.timedOut);
  }
}

export async function renderPrometheusMetrics(snapshot: RuntimeMetricsSnapshot): Promise<string> {
  updatePrometheusRuntimeMetrics(snapshot);
  return registry.metrics();
}

export function prometheusContentType(): string {
  return registry.contentType;
}

export function resetPrometheusMetricsForTests(): void {
  registry.resetMetrics();
  commandByTypeGauge.reset();
}

