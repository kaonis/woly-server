import HostDatabase from '../hostDatabase';
import * as networkDiscovery from '../networkDiscovery';
import ScanOrchestrator from '../scanOrchestrator';
import { logger } from '../../utils/logger';

jest.mock('../networkDiscovery');
jest.mock('../../utils/logger');
jest.mock('../../config', () => ({
  config: {
    server: {
      env: 'test',
    },
    network: {
      scanInterval: 300000,
      scanDelay: 5000,
      pingTimeout: 2000,
      pingConcurrency: 10,
      usePingValidation: false,
    },
    logging: {
      level: 'info',
    },
  },
}));

describe('ScanOrchestrator', () => {
  let db: HostDatabase;
  let scanOrchestrator: ScanOrchestrator;

  beforeEach(async () => {
    jest.clearAllMocks();
    db = new HostDatabase(':memory:');
    await db.initialize();
    scanOrchestrator = new ScanOrchestrator(db);
    (networkDiscovery.formatMAC as jest.Mock).mockImplementation((mac: string) =>
      mac.toUpperCase().replace(/-/g, ':')
    );
  });

  afterEach(async () => {
    scanOrchestrator.stopPeriodicSync();
    await db.close();
  });

  it('tracks scan state and updates last scan timestamp', async () => {
    let resolveScan: ((hosts: unknown[]) => void) | undefined;
    (networkDiscovery.scanNetworkARP as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveScan = resolve;
        })
    );

    const scanPromise = scanOrchestrator.syncWithNetwork();
    expect(scanOrchestrator.isScanInProgress()).toBe(true);

    resolveScan?.([]);
    const result = await scanPromise;

    expect(scanOrchestrator.isScanInProgress()).toBe(false);
    expect(scanOrchestrator.getLastScanTime()).not.toBeNull();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.discoveredHosts).toBe(0);
    }
  });

  it('skips concurrent scans', async () => {
    let resolveScan: ((hosts: unknown[]) => void) | undefined;
    (networkDiscovery.scanNetworkARP as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveScan = resolve;
        })
    );

    const firstScan = scanOrchestrator.syncWithNetwork();
    const secondResult = await scanOrchestrator.syncWithNetwork();
    resolveScan?.([]);
    await firstScan;

    expect(networkDiscovery.scanNetworkARP).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith('Scan already in progress, skipping...');
    expect(secondResult.success).toBe(false);
    if (!secondResult.success) {
      expect(secondResult.code).toBe('SCAN_IN_PROGRESS');
    }
  });

  it('runs and cancels periodic scans', () => {
    jest.useFakeTimers();
    (networkDiscovery.scanNetworkARP as jest.Mock).mockResolvedValue([]);

    scanOrchestrator.startPeriodicSync(10000, false);
    jest.advanceTimersByTime(5000);
    expect(networkDiscovery.scanNetworkARP).toHaveBeenCalledTimes(1);

    scanOrchestrator.stopPeriodicSync();
    jest.advanceTimersByTime(20000);
    expect(networkDiscovery.scanNetworkARP).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('returns failed scan result when discovery throws', async () => {
    (networkDiscovery.scanNetworkARP as jest.Mock).mockRejectedValue(new Error('arp failed'));

    const result = await scanOrchestrator.syncWithNetwork();

    expect(result).toEqual({
      success: false,
      error: 'arp failed',
      code: 'SCAN_FAILED',
    });
  });
});
