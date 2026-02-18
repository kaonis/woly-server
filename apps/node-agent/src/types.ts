/**
 * Type definitions for WoLy backend
 */

// Canonical Host type comes from the shared protocol package.
import type { Host } from '@kaonis/woly-protocol';
export type { Host };

export interface DiscoveredHost {
  ip: string;
  mac: string;
  hostname: string | null;
}

export interface MacVendorCacheEntry {
  vendor: string;
  timestamp: number;
}

export interface HostsResponse {
  hosts: Host[];
  scanInProgress: boolean;
  lastScanTime: string | null;
}

export interface HostMergeCandidate {
  targetName: string;
  targetMac: string;
  targetIp: string;
  candidateName: string;
  candidateMac: string;
  candidateIp: string;
  subnetHint: string;
  reason: 'same_hostname_subnet';
}

export interface HostMergeCandidatesResponse {
  candidates: HostMergeCandidate[];
  generatedAt: string;
}

export interface ScanResponse {
  message: string;
  hostsCount: number;
  hosts: Host[];
}

export type WakeVerificationStatus =
  | 'not_requested'
  | 'woke'
  | 'timeout'
  | 'not_confirmed'
  | 'host_not_found'
  | 'error';

export interface WakeVerificationResult {
  enabled: boolean;
  status: WakeVerificationStatus;
  attempts: number;
  timeoutMs: number;
  pollIntervalMs: number;
  elapsedMs: number;
  lastObservedStatus: Host['status'] | 'unknown';
  source?: 'database' | 'ping';
  message?: string;
}

export interface WakeUpResponse {
  // `success` indicates whether the WoL packet was sent.
  success: boolean;
  name: string;
  mac?: string;
  message?: string;
  error?: string;
  verification?: WakeVerificationResult;
}

export interface MacVendorResponse {
  mac: string;
  vendor: string;
  source: string;
}

export interface ErrorResponse {
  error: string;
  mac?: string;
}

export type {
  CncCommand,
  HostPayload,
  HostStatus,
  NodeMessage,
  NodeMetadata,
  NodeRegistration,
  RegisteredCommandData,
} from '@kaonis/woly-protocol';
