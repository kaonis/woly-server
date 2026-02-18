import { CommandModel } from '../../models/Command';
import { runtimeMetrics } from '../runtimeMetrics';
import logger from '../../utils/logger';
import type { CommandResult, CommandRecord } from '../../types';
import type {
  CommandLifecycleContext,
  DispatchCommand,
  ExecuteCommandOptions,
  PendingCommandEntry,
} from './types';

type DispatchPersistedCommandParams = {
  nodeId: string;
  commandId: string;
  commandType: DispatchCommand['type'];
  payload: DispatchCommand;
  retryCount: number;
  timeout: NodeJS.Timeout;
  correlationId: string | null;
  applyBackoff: boolean;
};

function createTimeoutHandler(
  context: CommandLifecycleContext,
  record: Pick<CommandRecord, 'id' | 'retryCount'>,
  commandType: DispatchCommand['type'],
): () => void {
  return () => {
    const pending = context.pendingCommands.get(record.id);
    context.pendingCommands.delete(record.id);
    runtimeMetrics.recordCommandTimeout(record.id, Date.now(), commandType);

    const attemptNumber = record.retryCount + 1;
    const error = new Error(
      `Command ${record.id} timed out after ${context.commandTimeout}ms (attempt ${attemptNumber}/${context.maxRetries})`,
    );

    CommandModel.markTimedOut(record.id, error.message).catch((err) => {
      logger.error('Failed to mark command as timed out', {
        commandId: record.id,
        attemptNumber,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    if (pending) {
      for (const resolver of pending.resolvers) {
        resolver.reject(error);
      }
    }
  };
}

export async function executeCommand(
  context: CommandLifecycleContext,
  nodeId: string,
  command: DispatchCommand,
  options: ExecuteCommandOptions,
): Promise<CommandResult> {
  const scopedIdempotencyKey = context.scopeIdempotencyKey(command.type, options.idempotencyKey);
  const record = await CommandModel.enqueue({
    id: command.commandId,
    nodeId,
    type: command.type,
    payload: command,
    idempotencyKey: scopedIdempotencyKey,
  });

  const effectiveCommandId = record.id;

  if (record.state === 'acknowledged') {
    logger.debug('Command already acknowledged, returning cached result', {
      commandId: effectiveCommandId,
      totalAttempts: record.retryCount,
    });

    return {
      commandId: effectiveCommandId,
      success: true,
      state: 'acknowledged',
      timestamp: record.completedAt ?? record.updatedAt,
      correlationId: options.correlationId ?? undefined,
    };
  }

  if (record.state === 'failed' || record.state === 'timed_out') {
    logger.warn('Command in terminal state', {
      commandId: effectiveCommandId,
      state: record.state,
      totalAttempts: record.retryCount,
      maxRetries: context.maxRetries,
    });

    return {
      commandId: effectiveCommandId,
      success: false,
      state: record.state,
      error: record.error ?? 'Command failed',
      timestamp: record.completedAt ?? record.updatedAt,
      correlationId: options.correlationId ?? undefined,
    };
  }

  if (record.state === 'queued' && !context.nodeManager.isNodeConnected(nodeId)) {
    logger.info('Queued command for offline node', {
      commandId: effectiveCommandId,
      nodeId,
      type: command.type,
    });

    return {
      commandId: effectiveCommandId,
      success: true,
      state: 'queued',
      message: context.buildQueuedMessage(),
      timestamp: record.updatedAt,
      correlationId: options.correlationId ?? undefined,
    };
  }

  const payloadToSend = record.payload as DispatchCommand;

  return new Promise((resolve, reject) => {
    const existingPending = context.pendingCommands.get(effectiveCommandId);
    if (existingPending) {
      existingPending.resolvers.push({ resolve, reject });
      return;
    }

    const timeout = setTimeout(
      createTimeoutHandler(context, { id: effectiveCommandId, retryCount: record.retryCount }, command.type),
      context.commandTimeout,
    );

    context.pendingCommands.set(effectiveCommandId, {
      resolvers: [{ resolve, reject }],
      timeout,
      correlationId: options.correlationId,
      commandType: command.type,
    });

    if (record.state !== 'queued') {
      logger.debug(`Command ${effectiveCommandId} already ${record.state}; not resending`);
      return;
    }

    void dispatchPersistedCommand(context, {
      nodeId,
      commandId: effectiveCommandId,
      commandType: command.type,
      payload: payloadToSend,
      retryCount: record.retryCount,
      timeout,
      correlationId: options.correlationId,
      applyBackoff: record.state === 'queued',
    });
  });
}

export async function dispatchPersistedCommand(
  context: CommandLifecycleContext,
  params: DispatchPersistedCommandParams,
): Promise<void> {
  const {
    nodeId,
    commandId,
    commandType,
    payload,
    retryCount,
    timeout,
    correlationId,
    applyBackoff,
  } = params;

  try {
    if (applyBackoff && retryCount > 0) {
      const attemptNumber = retryCount;
      const backoffDelay = context.calculateBackoffDelay(attemptNumber - 1);
      logger.info('Applying exponential backoff before retry', {
        commandId,
        attemptNumber,
        backoffDelayMs: Math.round(backoffDelay),
      });
      await new Promise((resolve) => setTimeout(resolve, backoffDelay));
    }

    context.nodeManager.sendCommand(nodeId, payload);
    runtimeMetrics.recordCommandDispatched(commandId, commandType, correlationId);
    await CommandModel.markSent(commandId);

    logger.debug('Sent command to node', {
      commandId,
      nodeId,
      attemptNumber: retryCount + 1,
      type: commandType,
    });
  } catch (error) {
    const pending = context.pendingCommands.get(commandId);
    clearTimeout(timeout);
    context.pendingCommands.delete(commandId);

    const message = error instanceof Error ? error.message : String(error);
    const err = error instanceof Error ? error : new Error(message);

    await CommandModel.markFailed(commandId, message);
    runtimeMetrics.recordCommandResult(commandId, false, Date.now(), commandType);

    logger.error('Failed to send command', {
      commandId,
      nodeId,
      attemptNumber: retryCount + 1,
      error: message,
    });

    if (pending) {
      for (const resolver of pending.resolvers) {
        resolver.reject(err);
      }
    }
  }
}

export async function applyCommandResult(
  context: CommandLifecycleContext,
  result: CommandResult,
): Promise<void> {
  const pending = context.pendingCommands.get(result.commandId);
  const persistedCommand = pending ? null : await context.resolvePersistedCommand(result.commandId);
  const metricCommandType = pending?.commandType ?? persistedCommand?.type ?? null;

  runtimeMetrics.recordCommandResult(result.commandId, result.success, Date.now(), metricCommandType);

  logger.debug('Received command result', {
    commandId: result.commandId,
    success: result.success,
    error: result.error,
    correlationId: runtimeMetrics.lookupCorrelationId(result.commandId),
  });

  const correlationId =
    pending?.correlationId ?? runtimeMetrics.lookupCorrelationId(result.commandId) ?? undefined;

  if (result.success) {
    CommandModel.markAcknowledged(result.commandId)
      .then(() => {
        logger.info('Command acknowledged', {
          commandId: result.commandId,
          correlationId,
        });
      })
      .catch((error) => {
        logger.error('Failed to mark command as acknowledged', {
          commandId: result.commandId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  } else {
    CommandModel.markFailed(result.commandId, result.error || 'Command failed')
      .then(() => {
        logger.warn('Command failed', {
          commandId: result.commandId,
          error: result.error,
          correlationId,
        });
      })
      .catch((error) => {
        logger.error('Failed to mark command as failed', {
          commandId: result.commandId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  if (!pending) {
    const verificationFqn = context.wakeVerificationCommands.get(result.commandId);
    if (verificationFqn && result.wakeVerification) {
      context.wakeVerificationCommands.delete(result.commandId);
      logger.info('Wake verification follow-up received', {
        commandId: result.commandId,
        fqn: verificationFqn,
        status: result.wakeVerification.status,
        attempts: result.wakeVerification.attempts,
        elapsedMs: result.wakeVerification.elapsedMs,
      });

      context.emitWakeVerificationComplete({
        commandId: result.commandId,
        fullyQualifiedName: verificationFqn,
        wakeVerification: result.wakeVerification,
      });
      return;
    }

    if (persistedCommand) {
      logger.debug('Processed async command result without active HTTP waiter', {
        commandId: result.commandId,
        state: persistedCommand.state,
      });
      return;
    }

    logger.warn(`Received result for unknown command: ${result.commandId}`);
    return;
  }

  clearTimeout(pending.timeout);
  context.pendingCommands.delete(result.commandId);

  if (result.success) {
    for (const resolver of pending.resolvers) {
      resolver.resolve({ ...result, correlationId, state: 'acknowledged' });
    }
    return;
  }

  for (const resolver of pending.resolvers) {
    resolver.reject(new Error(result.error || 'Command failed'));
  }
}

export function handleNodeConnected(context: CommandLifecycleContext, event: { nodeId: string }): void {
  const { nodeId } = event;
  if (context.flushingNodes.has(nodeId)) {
    return;
  }

  context.flushingNodes.add(nodeId);
  void flushQueuedCommandsForNode(context, nodeId).finally(() => {
    context.flushingNodes.delete(nodeId);
  });
}

export async function flushQueuedCommandsForNode(
  context: CommandLifecycleContext,
  nodeId: string,
): Promise<void> {
  const queued = await CommandModel.listQueuedByNode(nodeId, { limit: 500 });
  if (queued.length === 0) {
    return;
  }

  logger.info('Flushing queued commands for reconnected node', {
    nodeId,
    queuedCount: queued.length,
  });

  for (const record of queued) {
    if (context.isQueuedCommandExpired(record)) {
      await CommandModel.markFailed(record.id, context.buildQueueExpiryMessage());
      continue;
    }

    const payload = context.asDispatchCommand(record.payload);
    if (!payload) {
      await CommandModel.markFailed(record.id, 'Queued command payload is invalid');
      continue;
    }

    const existingPending = context.pendingCommands.get(record.id);
    if (existingPending) {
      continue;
    }

    const timeout = setTimeout(
      createTimeoutHandler(context, { id: record.id, retryCount: record.retryCount }, payload.type),
      context.commandTimeout,
    );

    const pendingEntry: PendingCommandEntry = {
      resolvers: [],
      timeout,
      correlationId: null,
      commandType: payload.type,
    };

    context.pendingCommands.set(record.id, pendingEntry);

    await dispatchPersistedCommand(context, {
      nodeId,
      commandId: record.id,
      commandType: payload.type,
      payload,
      retryCount: record.retryCount,
      timeout,
      correlationId: null,
      applyBackoff: true,
    });
  }
}
