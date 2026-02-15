import { config } from '../config';
import { Host, DiscoveredHost } from '../types';
import { logger } from '../utils/logger';
import HostDatabase from './hostDatabase';
import * as networkDiscovery from './networkDiscovery';

type NetworkDiscoveryDeps = Pick<
  typeof networkDiscovery,
  'scanNetworkARP' | 'isHostAlive' | 'formatMAC'
>;

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

  async syncWithNetwork(): Promise<void> {
    if (this.scanInProgress) {
      logger.info('Scan already in progress, skipping...');
      return;
    }

    this.scanInProgress = true;

    try {
      logger.info('Starting network scan...');
      const discoveredHosts = await this.discovery.scanNetworkARP();

      if (discoveredHosts.length === 0) {
        logger.info('No hosts discovered in network scan');
        return;
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

            await this.hostDb.addHost(hostName, formattedMac, host.ip);
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Network sync error: ${message}`);
    } finally {
      this.scanInProgress = false;
      this.lastScanTime = new Date();
    }
  }

  startPeriodicSync(intervalMs: number = 5 * 60 * 1000, immediateSync: boolean = false): void {
    logger.info(`Starting periodic network sync every ${intervalMs / 1000}s`);

    if (immediateSync) {
      this.syncWithNetwork();
    } else {
      logger.info(
        `Deferring initial network scan to background (${config.network.scanDelay / 1000} seconds)`
      );
      this.deferredSyncTimeout = setTimeout(() => {
        logger.info('Running deferred initial network scan...');
        this.syncWithNetwork();
      }, config.network.scanDelay);
    }

    this.syncInterval = setInterval(() => {
      this.syncWithNetwork();
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
