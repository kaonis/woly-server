/**
 * Tests for MAC Vendor Lookup Service
 */

import { lookupMacVendor, clearCache } from '../macVendorService';

// Silence logger during tests
jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('macVendorService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearCache();
  });

  it('should return vendor for a valid MAC address', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => 'Apple, Inc.',
    });

    const result = await lookupMacVendor('80:6D:97:60:39:08');

    expect(result).toEqual({
      mac: '80:6D:97:60:39:08',
      vendor: 'Apple, Inc.',
      source: 'macvendors.com',
    });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.macvendors.com/80%3A6D%3A97%3A60%3A39%3A08',
      expect.objectContaining({
        headers: { 'User-Agent': 'WoLy-CnC/1.0' },
      }),
    );
  });

  it('should return cached result on second call', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => 'Apple, Inc.',
    });

    // First call — hits external API
    await lookupMacVendor('80:6D:97:60:39:08');
    // Second call — should be cached
    const result = await lookupMacVendor('80:6D:97:60:39:08');

    expect(result).toEqual({
      mac: '80:6D:97:60:39:08',
      vendor: 'Apple, Inc.',
      source: 'macvendors.com (cached)',
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should return "Unknown Vendor" for 404 responses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const result = await lookupMacVendor('FF:FF:FF:FF:FF:FF');

    expect(result).toEqual({
      mac: 'FF:FF:FF:FF:FF:FF',
      vendor: 'Unknown Vendor',
      source: 'macvendors.com',
    });
  });

  it('should throw with statusCode 429 on rate limit', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
    });

    await expect(lookupMacVendor('AA:BB:CC:DD:EE:FF')).rejects.toMatchObject({
      message: 'Rate limit exceeded, please try again later',
      statusCode: 429,
    });
  });

  it('should throw with statusCode 500 on server error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    await expect(lookupMacVendor('AA:BB:CC:DD:EE:FF')).rejects.toMatchObject({
      message: 'Failed to lookup MAC vendor',
      statusCode: 500,
    });
  });

  it('should normalize MAC for cache key (case-insensitive, delimiter-insensitive)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => 'Test Vendor',
    });

    await lookupMacVendor('aa:bb:cc:dd:ee:ff');
    const cachedResult = await lookupMacVendor('AA-BB-CC-DD-EE-FF');

    expect(cachedResult.source).toBe('macvendors.com (cached)');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
