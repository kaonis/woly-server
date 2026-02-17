type ProtocolDirection = 'inbound' | 'outbound';
type CommandOutcome = 'acknowledged' | 'failed' | 'timed_out';
const TRACKED_COMMAND_TYPES = [
  'wake',
  'scan',
  'scan-host-ports',
  'update-host',
  'delete-host',
  'ping-host',
] as const;

type CommandOutcomeSnapshot = {
  acknowledged: number;
  failed: number;
  timedOut: number;
};

type UnknownOutcomeAttributionSnapshot = CommandOutcomeSnapshot & {
  total: number;
};

type CommandMetricBucket = {
  dispatched: number;
  acknowledged: number;
  failed: number;
  timedOut: number;
  completed: number;
  cumulativeLatencyMs: number;
  lastLatencyMs: number | null;
};

type CommandMetricBucketSnapshot = {
  dispatched: number;
  acknowledged: number;
  failed: number;
  timedOut: number;
  avgLatencyMs: number;
  lastLatencyMs: number | null;
};

type ActiveCommand = {
  commandType: string;
  correlationId: string | null;
  startedAtMs: number;
};

type ResolvedCorrelation = {
  commandId: string;
  correlationId: string;
  outcome: CommandOutcome;
  resolvedAtMs: number;
};

export type RuntimeMetricsSnapshot = {
  startedAtMs: number;
  generatedAtMs: number;
  nodes: {
    connected: number;
    peakConnected: number;
  };
  protocol: {
    invalidPayloadTotal: number;
    invalidPayloadRatePerMinute: number;
    invalidPayloadByKey: Record<string, number>;
  };
  commands: {
    active: number;
    dispatched: number;
    acknowledged: number;
    failed: number;
    timedOut: number;
    timeoutRate: number;
    avgLatencyMs: number;
    lastLatencyMs: number | null;
    unknownAttribution: UnknownOutcomeAttributionSnapshot;
    outcomesByType: Record<string, CommandOutcomeSnapshot>;
    byType: Record<string, CommandMetricBucketSnapshot>;
  };
  correlations: {
    active: number;
    recentResolved: ResolvedCorrelation[];
  };
};

const MAX_RESOLVED_CORRELATIONS = 200;
const MAX_RECENT_RESOLVED_IN_SNAPSHOT = 20;

export class RuntimeMetrics {
  private startedAtMs = Date.now();
  private connectedNodes = 0;
  private peakConnectedNodes = 0;
  private invalidPayloadTotal = 0;
  private readonly invalidPayloadByKey = new Map<string, number>();
  private readonly commandTotals: CommandMetricBucket = {
    dispatched: 0,
    acknowledged: 0,
    failed: 0,
    timedOut: 0,
    completed: 0,
    cumulativeLatencyMs: 0,
    lastLatencyMs: null,
  };
  private readonly commandByType = new Map<string, CommandMetricBucket>();
  private readonly activeCommands = new Map<string, ActiveCommand>();
  private readonly resolvedCorrelationTrail: ResolvedCorrelation[] = [];
  private readonly resolvedCorrelationByCommandId = new Map<string, string>();

  constructor() {
    this.bootstrapTrackedCommandTypeBuckets();
  }

  public reset(nowMs = Date.now()): void {
    this.startedAtMs = nowMs;
    this.connectedNodes = 0;
    this.peakConnectedNodes = 0;
    this.invalidPayloadTotal = 0;
    this.invalidPayloadByKey.clear();
    this.commandTotals.dispatched = 0;
    this.commandTotals.acknowledged = 0;
    this.commandTotals.failed = 0;
    this.commandTotals.timedOut = 0;
    this.commandTotals.completed = 0;
    this.commandTotals.cumulativeLatencyMs = 0;
    this.commandTotals.lastLatencyMs = null;
    this.commandByType.clear();
    this.bootstrapTrackedCommandTypeBuckets();
    this.activeCommands.clear();
    this.resolvedCorrelationTrail.length = 0;
    this.resolvedCorrelationByCommandId.clear();
  }

  public setConnectedNodeCount(count: number): void {
    const normalizedCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
    this.connectedNodes = normalizedCount;
    if (normalizedCount > this.peakConnectedNodes) {
      this.peakConnectedNodes = normalizedCount;
    }
  }

  public recordInvalidPayload(direction: ProtocolDirection, messageType: string): void {
    const safeDirection = direction === 'outbound' ? 'outbound' : 'inbound';
    const normalizedMessageType =
      typeof messageType === 'string' && messageType.trim().length > 0
        ? messageType.trim()
        : 'unknown';

    const key = `${safeDirection}:${normalizedMessageType}`;
    this.invalidPayloadTotal += 1;
    this.invalidPayloadByKey.set(key, (this.invalidPayloadByKey.get(key) || 0) + 1);
  }

  public recordCommandDispatched(
    commandId: string,
    commandType: string,
    correlationId: string | null,
    nowMs = Date.now()
  ): void {
    const normalizedCommandId = this.normalizeCommandId(commandId);
    const normalizedCommandType = this.normalizeCommandType(commandType);
    const normalizedCorrelationId = this.normalizeCorrelationId(correlationId);
    const startedAtMs = Number.isFinite(nowMs) ? Math.floor(nowMs) : Date.now();

    this.commandTotals.dispatched += 1;
    this.getOrCreateCommandBucket(normalizedCommandType).dispatched += 1;
    this.activeCommands.set(normalizedCommandId, {
      commandType: normalizedCommandType,
      correlationId: normalizedCorrelationId,
      startedAtMs,
    });
  }

  public recordCommandResult(
    commandId: string,
    success: boolean,
    nowMs = Date.now(),
    commandTypeHint?: string | null
  ): void {
    this.resolveCommand(
      this.normalizeCommandId(commandId),
      success ? 'acknowledged' : 'failed',
      nowMs,
      commandTypeHint
    );
  }

  public recordCommandTimeout(
    commandId: string,
    nowMs = Date.now(),
    commandTypeHint?: string | null
  ): void {
    this.resolveCommand(this.normalizeCommandId(commandId), 'timed_out', nowMs, commandTypeHint);
  }

  public lookupCorrelationId(commandId: string): string | null {
    const normalizedCommandId = this.normalizeCommandId(commandId);
    const active = this.activeCommands.get(normalizedCommandId);
    if (active?.correlationId) {
      return active.correlationId;
    }

    return this.resolvedCorrelationByCommandId.get(normalizedCommandId) ?? null;
  }

  public snapshot(nowMs = Date.now()): RuntimeMetricsSnapshot {
    const elapsedMs = Math.max(nowMs - this.startedAtMs, 1);
    const timeoutRate =
      this.commandTotals.completed > 0
        ? this.commandTotals.timedOut / this.commandTotals.completed
        : 0;

    const byType = Object.fromEntries(
      Array.from(this.commandByType.entries()).map(([commandType, bucket]) => [
        commandType,
        this.toBucketSnapshot(bucket),
      ])
    );
    const outcomesByType = Object.fromEntries(
      Array.from(this.commandByType.entries()).map(([commandType, bucket]) => [
        commandType,
        this.toOutcomeSnapshot(bucket),
      ])
    );
    const unknownOutcomeAttribution = this.toUnknownOutcomeSnapshot(
      this.commandByType.get('unknown') ?? null
    );

    return {
      startedAtMs: this.startedAtMs,
      generatedAtMs: nowMs,
      nodes: {
        connected: this.connectedNodes,
        peakConnected: this.peakConnectedNodes,
      },
      protocol: {
        invalidPayloadTotal: this.invalidPayloadTotal,
        invalidPayloadRatePerMinute: Number(
          ((this.invalidPayloadTotal * 60_000) / elapsedMs).toFixed(2)
        ),
        invalidPayloadByKey: Object.fromEntries(this.invalidPayloadByKey.entries()),
      },
      commands: {
        active: this.activeCommands.size,
        dispatched: this.commandTotals.dispatched,
        acknowledged: this.commandTotals.acknowledged,
        failed: this.commandTotals.failed,
        timedOut: this.commandTotals.timedOut,
        timeoutRate: Number(timeoutRate.toFixed(4)),
        avgLatencyMs:
          this.commandTotals.completed > 0
            ? Math.round(this.commandTotals.cumulativeLatencyMs / this.commandTotals.completed)
            : 0,
        lastLatencyMs: this.commandTotals.lastLatencyMs,
        unknownAttribution: unknownOutcomeAttribution,
        outcomesByType,
        byType,
      },
      correlations: {
        active: this.activeCommands.size,
        recentResolved: this.resolvedCorrelationTrail.slice(-MAX_RECENT_RESOLVED_IN_SNAPSHOT),
      },
    };
  }

  private resolveCommand(
    commandId: string,
    outcome: CommandOutcome,
    nowMs: number,
    commandTypeHint?: string | null
  ): void {
    const active = this.activeCommands.get(commandId);
    const commandType =
      active?.commandType ?? this.normalizeCommandType(commandTypeHint ?? 'unknown');
    const startedAtMs = active?.startedAtMs ?? nowMs;
    const latencyMs = Math.max(0, Math.round(nowMs - startedAtMs));

    this.applyOutcome(this.commandTotals, outcome, latencyMs);
    this.applyOutcome(this.getOrCreateCommandBucket(commandType), outcome, latencyMs);

    if (active) {
      this.activeCommands.delete(commandId);
      if (active.correlationId) {
        this.pushResolvedCorrelation({
          commandId,
          correlationId: active.correlationId,
          outcome,
          resolvedAtMs: nowMs,
        });
      }
    }
  }

  private pushResolvedCorrelation(entry: ResolvedCorrelation): void {
    this.resolvedCorrelationTrail.push(entry);
    this.resolvedCorrelationByCommandId.set(entry.commandId, entry.correlationId);

    if (this.resolvedCorrelationTrail.length <= MAX_RESOLVED_CORRELATIONS) {
      return;
    }

    const removed = this.resolvedCorrelationTrail.shift();
    if (removed) {
      this.resolvedCorrelationByCommandId.delete(removed.commandId);
    }
  }

  private applyOutcome(
    bucket: CommandMetricBucket,
    outcome: CommandOutcome,
    latencyMs: number
  ): void {
    if (outcome === 'acknowledged') {
      bucket.acknowledged += 1;
    } else if (outcome === 'failed') {
      bucket.failed += 1;
    } else {
      bucket.timedOut += 1;
    }

    bucket.completed += 1;
    bucket.cumulativeLatencyMs += latencyMs;
    bucket.lastLatencyMs = latencyMs;
  }

  private getOrCreateCommandBucket(commandType: string): CommandMetricBucket {
    const existing = this.commandByType.get(commandType);
    if (existing) {
      return existing;
    }

    const created: CommandMetricBucket = {
      dispatched: 0,
      acknowledged: 0,
      failed: 0,
      timedOut: 0,
      completed: 0,
      cumulativeLatencyMs: 0,
      lastLatencyMs: null,
    };
    this.commandByType.set(commandType, created);
    return created;
  }

  private toBucketSnapshot(bucket: CommandMetricBucket): CommandMetricBucketSnapshot {
    return {
      dispatched: bucket.dispatched,
      acknowledged: bucket.acknowledged,
      failed: bucket.failed,
      timedOut: bucket.timedOut,
      avgLatencyMs: bucket.completed > 0 ? Math.round(bucket.cumulativeLatencyMs / bucket.completed) : 0,
      lastLatencyMs: bucket.lastLatencyMs,
    };
  }

  private toOutcomeSnapshot(bucket: CommandMetricBucket): CommandOutcomeSnapshot {
    return {
      acknowledged: bucket.acknowledged,
      failed: bucket.failed,
      timedOut: bucket.timedOut,
    };
  }

  private toUnknownOutcomeSnapshot(
    bucket: CommandMetricBucket | null
  ): UnknownOutcomeAttributionSnapshot {
    if (!bucket) {
      return {
        acknowledged: 0,
        failed: 0,
        timedOut: 0,
        total: 0,
      };
    }

    const outcomes = this.toOutcomeSnapshot(bucket);
    return {
      ...outcomes,
      total: outcomes.acknowledged + outcomes.failed + outcomes.timedOut,
    };
  }

  private normalizeCommandId(commandId: string): string {
    if (typeof commandId !== 'string' || commandId.trim().length === 0) {
      return 'unknown-command-id';
    }
    return commandId.trim();
  }

  private normalizeCommandType(commandType: string): string {
    if (typeof commandType !== 'string' || commandType.trim().length === 0) {
      return 'unknown';
    }
    return commandType.trim();
  }

  private normalizeCorrelationId(correlationId: string | null): string | null {
    if (typeof correlationId !== 'string') {
      return null;
    }
    const trimmed = correlationId.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private bootstrapTrackedCommandTypeBuckets(): void {
    for (const commandType of TRACKED_COMMAND_TYPES) {
      this.getOrCreateCommandBucket(commandType);
    }
  }
}

export const runtimeMetrics = new RuntimeMetrics();
