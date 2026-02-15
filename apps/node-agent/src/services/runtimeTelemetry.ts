export type ProtocolDirection = 'inbound' | 'outbound';

type CommandMetricBucket = {
  total: number;
  success: number;
  failed: number;
  cumulativeLatencyMs: number;
  lastLatencyMs: number | null;
};

type CommandMetricBucketSnapshot = {
  total: number;
  success: number;
  failed: number;
  avgLatencyMs: number;
  lastLatencyMs: number | null;
};

export type RuntimeTelemetrySnapshot = {
  startedAtMs: number;
  generatedAtMs: number;
  reconnect: {
    scheduled: number;
    failed: number;
  };
  auth: {
    expired: number;
    revoked: number;
    unavailable: number;
  };
  protocol: {
    inboundValidationFailures: number;
    outboundValidationFailures: number;
    unsupported: number;
    errors: number;
  };
  commands: {
    total: number;
    success: number;
    failed: number;
    avgLatencyMs: number;
    lastLatencyMs: number | null;
    byType: Record<string, CommandMetricBucketSnapshot>;
  };
};

export class RuntimeTelemetry {
  private startedAtMs = Date.now();
  private reconnectScheduled = 0;
  private reconnectFailed = 0;
  private authExpired = 0;
  private authRevoked = 0;
  private authUnavailable = 0;
  private protocolInboundValidationFailures = 0;
  private protocolOutboundValidationFailures = 0;
  private protocolUnsupported = 0;
  private protocolErrors = 0;
  private commandTotals: CommandMetricBucket = {
    total: 0,
    success: 0,
    failed: 0,
    cumulativeLatencyMs: 0,
    lastLatencyMs: null,
  };
  private readonly commandByType = new Map<string, CommandMetricBucket>();

  public reset(nowMs = Date.now()): void {
    this.startedAtMs = nowMs;
    this.reconnectScheduled = 0;
    this.reconnectFailed = 0;
    this.authExpired = 0;
    this.authRevoked = 0;
    this.authUnavailable = 0;
    this.protocolInboundValidationFailures = 0;
    this.protocolOutboundValidationFailures = 0;
    this.protocolUnsupported = 0;
    this.protocolErrors = 0;
    this.commandTotals = {
      total: 0,
      success: 0,
      failed: 0,
      cumulativeLatencyMs: 0,
      lastLatencyMs: null,
    };
    this.commandByType.clear();
  }

  public recordReconnectScheduled(): void {
    this.reconnectScheduled += 1;
  }

  public recordReconnectFailed(): void {
    this.reconnectFailed += 1;
  }

  public recordAuthExpired(): void {
    this.authExpired += 1;
  }

  public recordAuthRevoked(): void {
    this.authRevoked += 1;
  }

  public recordAuthUnavailable(): void {
    this.authUnavailable += 1;
  }

  public recordProtocolValidationFailure(direction: ProtocolDirection): void {
    if (direction === 'inbound') {
      this.protocolInboundValidationFailures += 1;
      return;
    }

    this.protocolOutboundValidationFailures += 1;
  }

  public recordProtocolUnsupported(): void {
    this.protocolUnsupported += 1;
  }

  public recordProtocolError(): void {
    this.protocolErrors += 1;
  }

  public recordCommandResult(commandType: string, success: boolean, latencyMs: number): void {
    const normalizedLatencyMs =
      Number.isFinite(latencyMs) && latencyMs > 0 ? Math.round(latencyMs) : 0;

    this.applyCommandMetrics(this.commandTotals, success, normalizedLatencyMs);
    this.applyCommandMetrics(this.getOrCreateCommandBucket(commandType), success, normalizedLatencyMs);
  }

  public snapshot(nowMs = Date.now()): RuntimeTelemetrySnapshot {
    const byType = Object.fromEntries(
      Array.from(this.commandByType.entries()).map(([commandType, metrics]) => [
        commandType,
        this.toCommandBucketSnapshot(metrics),
      ])
    );

    return {
      startedAtMs: this.startedAtMs,
      generatedAtMs: nowMs,
      reconnect: {
        scheduled: this.reconnectScheduled,
        failed: this.reconnectFailed,
      },
      auth: {
        expired: this.authExpired,
        revoked: this.authRevoked,
        unavailable: this.authUnavailable,
      },
      protocol: {
        inboundValidationFailures: this.protocolInboundValidationFailures,
        outboundValidationFailures: this.protocolOutboundValidationFailures,
        unsupported: this.protocolUnsupported,
        errors: this.protocolErrors,
      },
      commands: {
        ...this.toCommandBucketSnapshot(this.commandTotals),
        byType,
      },
    };
  }

  private getOrCreateCommandBucket(commandType: string): CommandMetricBucket {
    const existing = this.commandByType.get(commandType);
    if (existing) {
      return existing;
    }

    const created: CommandMetricBucket = {
      total: 0,
      success: 0,
      failed: 0,
      cumulativeLatencyMs: 0,
      lastLatencyMs: null,
    };
    this.commandByType.set(commandType, created);
    return created;
  }

  private applyCommandMetrics(bucket: CommandMetricBucket, success: boolean, latencyMs: number): void {
    bucket.total += 1;
    bucket.cumulativeLatencyMs += latencyMs;
    bucket.lastLatencyMs = latencyMs;

    if (success) {
      bucket.success += 1;
      return;
    }

    bucket.failed += 1;
  }

  private toCommandBucketSnapshot(bucket: CommandMetricBucket): CommandMetricBucketSnapshot {
    return {
      total: bucket.total,
      success: bucket.success,
      failed: bucket.failed,
      avgLatencyMs: bucket.total > 0 ? Math.round(bucket.cumulativeLatencyMs / bucket.total) : 0,
      lastLatencyMs: bucket.lastLatencyMs,
    };
  }
}

export const runtimeTelemetry = new RuntimeTelemetry();
