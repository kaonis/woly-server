import {
  renderPrometheusMetrics,
  resetPrometheusMetricsForTests,
} from '../promMetrics';
import type { RuntimeMetricsSnapshot } from '../runtimeMetrics';

describe('promMetrics', () => {
  afterEach(() => {
    resetPrometheusMetricsForTests();
  });

  it('renders runtime metrics in Prometheus exposition format', async () => {
    const snapshot: RuntimeMetricsSnapshot = {
      startedAtMs: 1,
      generatedAtMs: 2,
      nodes: {
        connected: 3,
        peakConnected: 5,
      },
      protocol: {
        invalidPayloadTotal: 7,
        invalidPayloadRatePerMinute: 2.5,
        invalidPayloadByKey: {},
      },
      commands: {
        active: 1,
        dispatched: 11,
        acknowledged: 8,
        failed: 2,
        timedOut: 1,
        timeoutRate: 0.0909,
        avgLatencyMs: 123,
        lastLatencyMs: 200,
        byType: {
          wake: {
            dispatched: 5,
            acknowledged: 4,
            failed: 1,
            timedOut: 0,
            avgLatencyMs: 90,
            lastLatencyMs: 110,
          },
        },
      },
      correlations: {
        active: 1,
        recentResolved: [],
      },
    };

    const metrics = await renderPrometheusMetrics(snapshot);

    expect(metrics).toContain('woly_cnc_nodes_connected');
    expect(metrics).toContain('woly_cnc_nodes_peak_connected');
    expect(metrics).toContain('woly_cnc_protocol_invalid_payload_total');
    expect(metrics).toContain('woly_cnc_commands_dispatched_total');
    expect(metrics).toContain('woly_cnc_command_avg_latency_ms');
    expect(metrics).toMatch(/woly_cnc_nodes_connected\{[^}]*app=\"woly-cnc\"[^}]*\} 3/);
    expect(metrics).toMatch(/woly_cnc_command_timeout_rate\{[^}]*app=\"woly-cnc\"[^}]*\} 0.0909/);
    expect(metrics).toMatch(
      /woly_cnc_commands_by_type\{(?=[^}]*state=\"acknowledged\")(?=[^}]*type=\"wake\")[^}]*\} 4/
    );
  });
});
