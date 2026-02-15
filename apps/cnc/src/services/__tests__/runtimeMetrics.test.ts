import { RuntimeMetrics } from '../runtimeMetrics';

describe('RuntimeMetrics', () => {
  it('tracks connected node counts and peak', () => {
    const metrics = new RuntimeMetrics();
    metrics.reset(1000);

    metrics.setConnectedNodeCount(1);
    metrics.setConnectedNodeCount(3);
    metrics.setConnectedNodeCount(2);

    const snapshot = metrics.snapshot(2000);
    expect(snapshot.nodes).toEqual({
      connected: 2,
      peakConnected: 3,
    });
  });

  it('tracks invalid payload totals and rates', () => {
    const metrics = new RuntimeMetrics();
    metrics.reset(0);

    metrics.recordInvalidPayload('inbound', 'register');
    metrics.recordInvalidPayload('inbound', 'register');
    metrics.recordInvalidPayload('outbound', 'wake');

    const snapshot = metrics.snapshot(60_000);
    expect(snapshot.protocol.invalidPayloadTotal).toBe(3);
    expect(snapshot.protocol.invalidPayloadByKey['inbound:register']).toBe(2);
    expect(snapshot.protocol.invalidPayloadByKey['outbound:wake']).toBe(1);
    expect(snapshot.protocol.invalidPayloadRatePerMinute).toBe(3);
  });

  it('tracks command latency, timeout rate, and correlation trail', () => {
    const metrics = new RuntimeMetrics();
    metrics.reset(100);

    metrics.recordCommandDispatched('cmd-1', 'wake', 'corr-1', 100);
    metrics.recordCommandResult('cmd-1', true, 180);

    metrics.recordCommandDispatched('cmd-2', 'scan', 'corr-2', 200);
    metrics.recordCommandResult('cmd-2', false, 350);

    metrics.recordCommandDispatched('cmd-3', 'delete-host', null, 300);
    metrics.recordCommandTimeout('cmd-3', 600);

    const snapshot = metrics.snapshot(700);
    expect(snapshot.commands.dispatched).toBe(3);
    expect(snapshot.commands.acknowledged).toBe(1);
    expect(snapshot.commands.failed).toBe(1);
    expect(snapshot.commands.timedOut).toBe(1);
    expect(snapshot.commands.timeoutRate).toBeCloseTo(0.3333, 4);
    expect(snapshot.commands.avgLatencyMs).toBe(177);
    expect(snapshot.commands.byType.wake.acknowledged).toBe(1);
    expect(snapshot.commands.byType.scan.failed).toBe(1);
    expect(snapshot.commands.byType['delete-host'].timedOut).toBe(1);
    expect(snapshot.correlations.recentResolved).toHaveLength(2);
    expect(metrics.lookupCorrelationId('cmd-1')).toBe('corr-1');
    expect(metrics.lookupCorrelationId('cmd-3')).toBeNull();
  });
});
