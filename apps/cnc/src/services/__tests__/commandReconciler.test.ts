import {
  pruneOldCommands,
  reconcileCommandsOnStartup,
  startCommandPruning,
  stopCommandPruning,
} from '../commandReconciler';
import { CommandModel } from '../../models/Command';
import logger from '../../utils/logger';

jest.mock('../../models/Command', () => ({
  CommandModel: {
    reconcileStaleInFlight: jest.fn(),
    pruneOldCommands: jest.fn(),
  },
}));

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockedCommandModel = CommandModel as jest.Mocked<typeof CommandModel>;
const mockedLogger = logger as jest.Mocked<typeof logger>;

describe('commandReconciler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stopCommandPruning();
  });

  afterEach(() => {
    stopCommandPruning();
  });

  describe('reconcileCommandsOnStartup', () => {
    it('warns when stale commands are reconciled', async () => {
      mockedCommandModel.reconcileStaleInFlight.mockResolvedValueOnce(3);

      await reconcileCommandsOnStartup({ commandTimeoutMs: 30_000 });

      expect(mockedCommandModel.reconcileStaleInFlight).toHaveBeenCalledWith(30_000);
      expect(mockedLogger.warn).toHaveBeenCalledWith(
        'Reconciled stale in-flight commands on startup',
        { count: 3 }
      );
    });

    it('logs info when no stale commands are found', async () => {
      mockedCommandModel.reconcileStaleInFlight.mockResolvedValueOnce(0);

      await reconcileCommandsOnStartup({ commandTimeoutMs: 60_000 });

      expect(mockedLogger.info).toHaveBeenCalledWith(
        'No stale in-flight commands to reconcile on startup'
      );
    });

    it('swallows reconciliation errors and logs them', async () => {
      const error = new Error('db unavailable');
      mockedCommandModel.reconcileStaleInFlight.mockRejectedValueOnce(error);

      await expect(
        reconcileCommandsOnStartup({ commandTimeoutMs: 10_000 })
      ).resolves.toBeUndefined();

      expect(mockedLogger.error).toHaveBeenCalledWith(
        'Failed to reconcile commands on startup',
        { error }
      );
    });
  });

  describe('pruneOldCommands', () => {
    it('returns prune count and logs when rows are pruned', async () => {
      mockedCommandModel.pruneOldCommands.mockResolvedValueOnce(5);

      const result = await pruneOldCommands(7);

      expect(result).toBe(5);
      expect(mockedCommandModel.pruneOldCommands).toHaveBeenCalledWith(7);
      expect(mockedLogger.info).toHaveBeenCalledWith('Pruned old commands', {
        count: 5,
        retentionDays: 7,
      });
    });

    it('returns zero when prune fails and logs the error', async () => {
      const error = new Error('prune failed');
      mockedCommandModel.pruneOldCommands.mockRejectedValueOnce(error);

      const result = await pruneOldCommands(30);

      expect(result).toBe(0);
      expect(mockedLogger.error).toHaveBeenCalledWith(
        'Failed to prune old commands',
        { error, retentionDays: 30 }
      );
    });
  });

  describe('startCommandPruning/stopCommandPruning', () => {
    it('disables pruning without scheduling when retention is non-positive', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      startCommandPruning(0);

      expect(setIntervalSpy).not.toHaveBeenCalled();
      expect(clearIntervalSpy).not.toHaveBeenCalled();
      expect(mockedLogger.info).toHaveBeenCalledWith(
        'Command pruning disabled (COMMAND_RETENTION_DAYS <= 0)'
      );

      setIntervalSpy.mockRestore();
      clearIntervalSpy.mockRestore();
    });

    it('replaces an existing schedule instead of leaking intervals', async () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      mockedCommandModel.pruneOldCommands.mockResolvedValue(0);

      startCommandPruning(7);
      await Promise.resolve();
      startCommandPruning(14);
      await Promise.resolve();

      expect(setIntervalSpy).toHaveBeenCalledTimes(2);
      expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
      expect(mockedCommandModel.pruneOldCommands).toHaveBeenCalledWith(7);
      expect(mockedCommandModel.pruneOldCommands).toHaveBeenCalledWith(14);

      setIntervalSpy.mockRestore();
      clearIntervalSpy.mockRestore();
    });

    it('stops and logs when pruning is active', async () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      mockedCommandModel.pruneOldCommands.mockResolvedValue(0);

      startCommandPruning(3);
      await Promise.resolve();

      stopCommandPruning();

      expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
      expect(mockedLogger.info).toHaveBeenCalledWith('Command pruning stopped');

      clearIntervalSpy.mockRestore();
    });
  });
});
