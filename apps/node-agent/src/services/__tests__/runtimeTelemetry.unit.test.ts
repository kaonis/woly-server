import { RuntimeTelemetry } from '../runtimeTelemetry';

describe('RuntimeTelemetry', () => {
  it('returns a zeroed snapshot after reset', () => {
    const telemetry = new RuntimeTelemetry();
    telemetry.recordReconnectScheduled();
    telemetry.recordAuthExpired();

    telemetry.reset(1234);
    const snapshot = telemetry.snapshot(2345);

    expect(snapshot.startedAtMs).toBe(1234);
    expect(snapshot.generatedAtMs).toBe(2345);
    expect(snapshot.reconnect).toEqual({ scheduled: 0, failed: 0 });
    expect(snapshot.auth).toEqual({ expired: 0, revoked: 0, unavailable: 0 });
    expect(snapshot.protocol).toEqual({
      inboundValidationFailures: 0,
      outboundValidationFailures: 0,
      unsupported: 0,
      errors: 0,
    });
    expect(snapshot.commands).toEqual({
      total: 0,
      success: 0,
      failed: 0,
      avgLatencyMs: 0,
      lastLatencyMs: null,
      byType: {},
    });
  });

  it('tracks reconnect, auth, and protocol counters', () => {
    const telemetry = new RuntimeTelemetry();
    telemetry.reset(100);

    telemetry.recordReconnectScheduled();
    telemetry.recordReconnectScheduled();
    telemetry.recordReconnectFailed();
    telemetry.recordAuthExpired();
    telemetry.recordAuthRevoked();
    telemetry.recordAuthUnavailable();
    telemetry.recordProtocolValidationFailure('inbound');
    telemetry.recordProtocolValidationFailure('outbound');
    telemetry.recordProtocolUnsupported();
    telemetry.recordProtocolError();

    const snapshot = telemetry.snapshot(200);

    expect(snapshot.reconnect).toEqual({ scheduled: 2, failed: 1 });
    expect(snapshot.auth).toEqual({ expired: 1, revoked: 1, unavailable: 1 });
    expect(snapshot.protocol).toEqual({
      inboundValidationFailures: 1,
      outboundValidationFailures: 1,
      unsupported: 1,
      errors: 1,
    });
  });

  it('tracks command metrics globally and by command type', () => {
    const telemetry = new RuntimeTelemetry();
    telemetry.reset(100);

    telemetry.recordCommandResult('wake', true, 15);
    telemetry.recordCommandResult('wake', false, 22.8);
    telemetry.recordCommandResult('scan', true, Number.NaN);
    telemetry.recordCommandResult('scan', true, -10);

    const snapshot = telemetry.snapshot(220);

    expect(snapshot.commands.total).toBe(4);
    expect(snapshot.commands.success).toBe(3);
    expect(snapshot.commands.failed).toBe(1);
    expect(snapshot.commands.avgLatencyMs).toBe(10);
    expect(snapshot.commands.lastLatencyMs).toBe(0);

    expect(snapshot.commands.byType.wake).toEqual({
      total: 2,
      success: 1,
      failed: 1,
      avgLatencyMs: 19,
      lastLatencyMs: 23,
    });
    expect(snapshot.commands.byType.scan).toEqual({
      total: 2,
      success: 2,
      failed: 0,
      avgLatencyMs: 0,
      lastLatencyMs: 0,
    });
  });
});
