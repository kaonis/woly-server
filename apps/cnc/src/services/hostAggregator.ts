/**
 * Host Aggregator Service
 *
 * Processes host events from node agents and maintains the aggregated_hosts table.
 * Handles conflict resolution for duplicate hostnames across nodes.
 */

import { EventEmitter } from 'events';
import type { AggregatedHost, HostStatusHistoryEntry, HostUptimeSummary } from '../types';
import {
  onHostDiscovered as handleHostDiscovered,
  onHostUpdated as handleHostUpdated,
  onHostRemoved as handleHostRemoved,
  markNodeHostsUnreachable as markHostsUnreachable,
  removeNodeHosts as removeHostsForNode,
  type HostDiscoveredEvent,
  type HostRemovedEvent,
  type HostSyncContext,
  type HostUpdatedEvent,
} from './hostAggregator/hostSync';
import {
  getAllHosts as queryAllHosts,
  getHostsByNode as queryHostsByNode,
  getHostByFQN as queryHostByFqn,
  getHostStatusHistory as queryHostStatusHistory,
  getHostUptime as queryHostUptime,
  pruneHostStatusHistory as pruneStatusHistory,
  saveHostPortScanSnapshot as savePortScanSnapshot,
  getStats as queryHostStats,
  type HostQueriesContext,
} from './hostAggregator/hostQueries';
import {
  HostStore,
  HOST_SELECT_COLUMNS,
  HISTORY_LIMIT_DEFAULT,
  HISTORY_LIMIT_MAX,
  PORT_SCAN_CACHE_TTL_MS,
  type AggregatedHostRow,
  type HostPort,
  type AggregatedHostRowRaw,
  type HostStatusHistoryRow,
} from './hostAggregator/hostStore';

export class HostAggregator extends EventEmitter {
  private readonly store: HostStore;

  constructor() {
    super();
    this.store = new HostStore((eventName, payload) => {
      this.emit(eventName, payload);
    });
  }

  async onHostDiscovered(event: HostDiscoveredEvent): Promise<void> {
    await handleHostDiscovered(this.createHostSyncContext(), event);
  }

  async onHostUpdated(event: HostUpdatedEvent): Promise<void> {
    await handleHostUpdated(this.createHostSyncContext(), event);
  }

  async onHostRemoved(event: HostRemovedEvent): Promise<void> {
    await handleHostRemoved(this.createHostSyncContext(), event);
  }

  async markNodeHostsUnreachable(nodeId: string): Promise<void> {
    await markHostsUnreachable(this.createHostSyncContext(), nodeId);
  }

  async removeNodeHosts(nodeId: string): Promise<void> {
    await removeHostsForNode(this.createHostSyncContext(), nodeId);
  }

  async getAllHosts(): Promise<AggregatedHost[]> {
    return queryAllHosts(this.createHostQueriesContext());
  }

  async getHostsByNode(nodeId: string): Promise<AggregatedHost[]> {
    return queryHostsByNode(this.createHostQueriesContext(), nodeId);
  }

  async getHostByFQN(fullyQualifiedName: string): Promise<AggregatedHost | null> {
    return queryHostByFqn(this.createHostQueriesContext(), fullyQualifiedName);
  }

  async getHostStatusHistory(
    fullyQualifiedName: string,
    options?: { from?: string; to?: string; limit?: number },
  ): Promise<HostStatusHistoryEntry[]> {
    return queryHostStatusHistory(this.createHostQueriesContext(), fullyQualifiedName, options);
  }

  async getHostUptime(
    fullyQualifiedName: string,
    options?: { period?: string; now?: Date },
  ): Promise<HostUptimeSummary> {
    return queryHostUptime(this.createHostQueriesContext(), fullyQualifiedName, options);
  }

  async pruneHostStatusHistory(retentionDays: number): Promise<number> {
    return pruneStatusHistory(this.createHostQueriesContext(), retentionDays);
  }

  async saveHostPortScanSnapshot(
    fullyQualifiedName: string,
    scan: { scannedAt: string; openPorts: HostPort[] },
  ): Promise<boolean> {
    return savePortScanSnapshot(this.createHostQueriesContext(), fullyQualifiedName, scan);
  }

  async getStats(): Promise<{
    total: number;
    awake: number;
    asleep: number;
    byLocation: Record<string, { total: number; awake: number }>;
  }> {
    return queryHostStats(this.createHostQueriesContext());
  }

  private createHostSyncContext(): HostSyncContext {
    return {
      isSqlite: this.store.isSqlite,
      ensureHostMetadataColumns: () => this.store.ensureHostMetadataColumns(),
      buildFQN: (name: string, location: string, nodeId?: string) =>
        this.store.buildFQN(name, location, nodeId),
      reconcileHostByMac: (nodeId, host, location) => this.store.reconcileHostByMac(nodeId, host, location),
      hasMeaningfulHostStateChange: (previous: AggregatedHostRow, next, location) =>
        this.store.hasMeaningfulHostStateChange(previous, next, location),
      recordHostStatusTransition: (
        hostFqn: string,
        oldStatusCandidate: unknown,
        newStatusCandidate: unknown,
        changedAtCandidate?: unknown,
      ) =>
        this.store.recordHostStatusTransition(
          hostFqn,
          oldStatusCandidate,
          newStatusCandidate,
          changedAtCandidate,
        ),
      insertHost: (nodeId, host, location, fullyQualifiedName) =>
        this.store.insertHost(nodeId, host, location, fullyQualifiedName),
      findHostRowByNodeAndName: (nodeId: string, name: string) =>
        this.store.findHostRowByNodeAndName(nodeId, name),
      emitEvent: (eventName: string, payload: Record<string, unknown>) => {
        this.emit(eventName, payload);
      },
    };
  }

  private createHostQueriesContext(): HostQueriesContext {
    return {
      isSqlite: this.store.isSqlite,
      historyLimitDefault: HISTORY_LIMIT_DEFAULT,
      historyLimitMax: HISTORY_LIMIT_MAX,
      portScanCacheTtlMs: PORT_SCAN_CACHE_TTL_MS,
      hostSelectColumns: HOST_SELECT_COLUMNS,
      ensureHostMetadataColumns: () => this.store.ensureHostMetadataColumns(),
      normalizeHost: (row: AggregatedHostRowRaw) => this.store.normalizeHost(row),
      normalizeDateValue: (value: unknown) => this.store.normalizeDateValue(value),
      mapStatusHistoryRow: (row: HostStatusHistoryRow) => this.store.mapStatusHistoryRow(row),
      parsePeriodToMs: (rawPeriod: string) => this.store.parsePeriodToMs(rawPeriod),
      getHostByFQN: (fullyQualifiedName: string) => this.getHostByFQN(fullyQualifiedName),
      getHostStatusHistory: (
        fullyQualifiedName: string,
        options?: { from?: string; to?: string; limit?: number },
      ) => this.getHostStatusHistory(fullyQualifiedName, options),
      serializeOpenPorts: (openPorts: HostPort[] | undefined) => this.store.serializeOpenPorts(openPorts),
    };
  }
}
