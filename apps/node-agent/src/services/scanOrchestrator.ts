import { config } from '../config';
import { Host, DiscoveredHost } from '../types';
import { logger } from '../utils/logger';
import HostDatabase from './hostDatabase';
import * as networkDiscovery from './networkDiscovery';

type NetworkDiscoveryDeps = Pick<
  typeof networkDiscovery,
  'scanNetworkARP' | 'isHostAlive' | 'formatMAC'
>;

export type ScanSyncResult =
  | {
      success: true;
      discoveredHosts: number;
      updatedHosts: number;
      newHosts: number;
      awakeHosts: number;
      hostCount: number;
    }
  | {
      success: false;
      error: string;
      code: 'SCAN_IN_PROGRESS' | 'SCAN_FAILED';
    };

/**
 * Coordinates network scans independently from database CRUD operations.
 */
class ScanOrchestrator {
  private syncInterval?: NodeJS.Timeout;
  private deferredSyncTimeout?: NodeJS.Timeout;
  private scanInProgress = false;
  private lastScanTime: Date | null = null;

  constructor(
    private readonly hostDb: HostDatabase,
    private readonly discovery: NetworkDiscoveryDeps = networkDiscovery
  ) {}

  isScanInProgress(): boolean {
    return this.scanInProgress;
  }

  getLastScanTime(): string | null {
    return this.lastScanTime ? this.lastScanTime.toISOString() : null;
  }

  async syncWithNetwork(): Promise<ScanSyncResult> {
    if (this.scanInProgress) {
      logger.info('Scan already in progress, skipping...');
      return {
        success: false,
        error: 'Scan already in progress',
        code: 'SCAN_IN_PROGRESS',
      };
    }

    this.scanInProgress = true;

    try {
      logger.info('Starting network scan...');
      const discoveredHosts = await this.discovery.scanNetworkARP();

      if (discoveredHosts.length === 0) {
        logger.info('No hosts discovered in network scan');
        const allHosts = await this.hostDb.getAllHosts();
        this.hostDb.emit('scan-complete', allHosts.length);
        return {
          success: true,
          discoveredHosts: 0,
          updatedHosts: 0,
          newHosts: 0,
          awakeHosts: 0,
          hostCount: allHosts.length,
        };
      }

      logger.info(`Discovered ${discoveredHosts.length} hosts on network`);

      let newHostCount = 0;
      let updatedHostCount = 0;
      let awakeCount = 0;

      const pingConcurrency = config.network.pingConcurrency;
      const hostsWithPingResults: Array<{
        host: DiscoveredHost;
        pingResponsive: number | null;
        status: Host['status'];
      }> = [];

      for (let i = 0; i < discoveredHosts.length; i += pingConcurrency) {
        const batch = discoveredHosts.slice(i, i + pingConcurrency);

        const batchResults = await Promise.all(
          batch.map(async (host) => {
            let isAlive: boolean;

            const pingResult = await this.discovery.isHostAlive(host.ip);
            const pingResponsive = pingResult ? 1 : 0;

            if (config.network.usePingValidation) {
              isAlive = pingResult;
              if (!isAlive) {
                logger.debug(
                  `Host ${host.ip} found via ARP but did not respond to ping - marking as asleep`
                );
              }
            } else {
              isAlive = true;
            }

            const status: Host['status'] = isAlive ? 'awake' : 'asleep';

            return { host, pingResponsive, status };
          })
        );

        hostsWithPingResults.push(...batchResults);
      }

      for (const { host, pingResponsive, status } of hostsWithPingResults) {
        const formattedMac = this.discovery.formatMAC(host.mac);

        if (status === 'awake') {
          awakeCount++;
        }

        try {
          await this.hostDb.updateHostSeen(formattedMac, status, pingResponsive);
          updatedHostCount++;

          const hostByMac = await this.hostDb.getHostByMAC(formattedMac);
          if (hostByMac) {
            this.hostDb.emit('host-updated', hostByMac);
          }
        } catch {
          try {
            const hostName = host.hostname ?? `device-${host.ip.replace(/\./g, '-')}`;

            await this.hostDb.addHost(hostName, formattedMac, host.ip, undefined, {
              emitLifecycleEvent: false,
            });
            await this.hostDb.updateHostStatus(hostName, status);
            await this.hostDb.updateHostSeen(formattedMac, status, pingResponsive);
            newHostCount++;

            const newHost = await this.hostDb.getHost(hostName);
            if (newHost) {
              this.hostDb.emit('host-discovered', newHost);
            }
          } catch (addErr) {
            logger.debug(`Could not add discovered host ${formattedMac}:`, {
              error: (addErr as Error).message,
            });
          }
        }
      }

      logger.info(
        `Network sync complete: ${updatedHostCount} updated, ${newHostCount} new hosts, ${awakeCount} awake`
      );

      const allHosts = await this.hostDb.getAllHosts();
      this.hostDb.emit('scan-complete', allHosts.length);
      return {
        success: true,
        discoveredHosts: discoveredHosts.length,
        updatedHosts: updatedHostCount,
        newHosts: newHostCount,
        awakeHosts: awakeCount,
        hostCount: allHosts.length,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Network sync error: ${message}`);
      return {
        success: false,
        error: message,
        code: 'SCAN_FAILED',
      };
    } finally {
      this.scanInProgress = false;
      this.lastScanTime = new Date();
    }
  }

  startPeriodicSync(intervalMs: number = 5 * 60 * 1000, immediateSync: boolean = false): void {
    logger.info(`Starting periodic network sync every ${intervalMs / 1000}s`);

    if (immediateSync) {
      void this.syncWithNetwork().then((result) => {
        if (!result.success && result.code !== 'SCAN_IN_PROGRESS') {
          logger.warn('Initial network sync failed', { error: result.error });
        }
      });
    } else {
      logger.info(
        `Deferring initial network scan to background (${config.network.scanDelay / 1000} seconds)`
      );
      this.deferredSyncTimeout = setTimeout(() => {
        logger.info('Running deferred initial network scan...');
        void this.syncWithNetwork().then((result) => {
          if (!result.success && result.code !== 'SCAN_IN_PROGRESS') {
            logger.warn('Deferred initial network sync failed', { error: result.error });
          }
        });
      }, config.network.scanDelay);
    }

    this.syncInterval = setInterval(() => {
      void this.syncWithNetwork().then((result) => {
        if (!result.success && result.code !== 'SCAN_IN_PROGRESS') {
          logger.warn('Periodic network sync failed', { error: result.error });
        }
      });
    }, intervalMs);
  }

  stopPeriodicSync(): void {
    if (this.deferredSyncTimeout) {
      clearTimeout(this.deferredSyncTimeout);
      this.deferredSyncTimeout = undefined;
    }
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
      logger.info('Stopped periodic network sync');
    }
  }
}

export default ScanOrchestrator;
