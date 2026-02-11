/**
 * MAC Vendor Lookup Service
 *
 * Provides MAC address vendor lookups using the macvendors.com API.
 * Includes in-memory caching with TTL and rate limiting to stay within
 * the free-tier limits of the external API.
 *
 * This is a standalone service that doesn't route commands through nodes —
 * the external API is reachable from the C&C server directly.
 */

import { LRUCache } from 'lru-cache';
import logger from '../utils/logger';

// --- Cache ---

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_MAX_SIZE = 1000;

const cache = new LRUCache<string, string>({
  max: CACHE_MAX_SIZE,
  ttl: CACHE_TTL_MS,
});

/**
 * Normalize and validate MAC address format.
 * @throws Error if MAC format is invalid
 */
function normalizeMac(mac: string): string {
  const trimmed = mac.trim().toUpperCase().replace(/[:-]/g, '');
  
  // Validate that result is exactly 12 hexadecimal characters
  if (!/^[0-9A-F]{12}$/.test(trimmed)) {
    throw new Error('Invalid MAC address format');
  }
  
  return trimmed;
}

// --- Rate limiting ---

const RATE_LIMIT_MS = 1000; // 1 second between external API calls
let lastRequestTime = 0;
let requestQueue: Promise<unknown> = Promise.resolve();

// --- Public API ---

export interface MacVendorResponse {
  mac: string;
  vendor: string;
  source: string;
}

/**
 * Look up the manufacturer/vendor for a given MAC address.
 * Results are cached for 24 hours.
 * External API calls are serialized to enforce 1 req/sec rate limit.
 */
export async function lookupMacVendor(mac: string): Promise<MacVendorResponse> {
  const normalizedMac = normalizeMac(mac);

  // Check cache (LRUCache handles TTL automatically)
  const cached = cache.get(normalizedMac);
  if (cached !== undefined) {
    logger.debug('MAC vendor cache hit', { mac });
    return { mac, vendor: cached, source: 'macvendors.com (cached)' };
  }

  // Serialize external lookups to enforce rate limit
  // Each request waits for the previous one to complete + rate limit delay
  const performLookup = async (): Promise<MacVendorResponse> => {
    // Rate limiting
    const now = Date.now();
    const timeSinceLast = now - lastRequestTime;
    if (timeSinceLast < RATE_LIMIT_MS) {
      const waitTime = RATE_LIMIT_MS - timeSinceLast;
      logger.debug('Throttling MAC vendor request', { mac, waitTime });
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    lastRequestTime = Date.now();

    // External lookup
    const url = `https://api.macvendors.com/${encodeURIComponent(mac)}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'WoLy-CnC/1.0' },
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      const vendor = await response.text();
      cache.set(normalizedMac, vendor);
      return { mac, vendor, source: 'macvendors.com' };
    }

    if (response.status === 404) {
      const vendor = 'Unknown Vendor';
      cache.set(normalizedMac, vendor);
      return { mac, vendor, source: 'macvendors.com' };
    }

    if (response.status === 429) {
      throw Object.assign(new Error('Rate limit exceeded, please try again later'), {
        statusCode: 429,
      });
    }

    throw Object.assign(new Error('Failed to lookup MAC vendor'), {
      statusCode: 500,
    });
  };

  // Chain the request to enforce serialization
  requestQueue = requestQueue.then(() => performLookup(), () => performLookup());
  return requestQueue as Promise<MacVendorResponse>;
}

/** Visible for testing — clears the in-memory cache and resets rate limiting. */
export function clearCache(): void {
  cache.clear();
  lastRequestTime = 0;
  requestQueue = Promise.resolve();
}
