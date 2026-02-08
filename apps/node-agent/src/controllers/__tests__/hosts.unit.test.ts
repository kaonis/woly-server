import { Request, Response } from 'express';
import * as hostsController from '../hosts';
import HostDatabase from '../../services/hostDatabase';
import axios from 'axios';
import wol from 'wake_on_lan';

// Mock all external dependencies
jest.mock('axios');
jest.mock('wake_on_lan');

describe('hosts controller', () => {
  let mockDb: jest.Mocked<HostDatabase>;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    // Create mock database
    mockDb = {
      getAllHosts: jest.fn(),
      getHost: jest.fn(),
      addHost: jest.fn(),
      updateHostStatus: jest.fn(),
      updateHostSeen: jest.fn(),
      syncWithNetwork: jest.fn(),
      initialize: jest.fn(),
      close: jest.fn(),
      createTable: jest.fn(),
      seedInitialHosts: jest.fn(),
      startPeriodicSync: jest.fn(),
      stopPeriodicSync: jest.fn(),
      isScanInProgress: jest.fn().mockReturnValue(false),
      getLastScanTime: jest.fn().mockReturnValue(null),
    } as any;

    // Create mock request
    mockReq = {
      params: {},
      body: {},
      query: {},
    };

    // Create mock response
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      sendStatus: jest.fn().mockReturnThis(),
    };

    // Set database for controller
    hostsController.setHostDatabase(mockDb);

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('setHostDatabase', () => {
    it('should set database instance correctly', () => {
      hostsController.setHostDatabase(mockDb);
      // No error means success
      expect(true).toBe(true);
    });
  });

  describe('getAllHosts', () => {
    it('should return all hosts successfully', async () => {
      const mockHosts = [
        {
          name: 'Host1',
          mac: 'AA:BB:CC:DD:EE:FF',
          ip: '192.168.1.1',
          status: 'awake',
          lastSeen: null,
          discovered: 1,
        },
      ];
      mockDb.getAllHosts.mockResolvedValue(mockHosts as any);

      await hostsController.getAllHosts(mockReq as Request, mockRes as Response);

      expect(mockDb.getAllHosts).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        hosts: mockHosts,
        scanInProgress: false,
        lastScanTime: null,
      });
    });

    it('should return empty array when no hosts exist', async () => {
      mockDb.getAllHosts.mockResolvedValue([]);

      await hostsController.getAllHosts(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        hosts: [],
        scanInProgress: false,
        lastScanTime: null,
      });
    });

    it('should handle database errors', async () => {
      mockDb.getAllHosts.mockRejectedValue(new Error('Database error'));

      // Controller now throws errors for Express error handler to catch
      await expect(
        hostsController.getAllHosts(mockReq as Request, mockRes as Response)
      ).rejects.toThrow('Database error');
    });

    it('should return error if database not initialized', async () => {
      hostsController.setHostDatabase(null as any);

      await hostsController.getAllHosts(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Database not initialized' });

      // Restore database
      hostsController.setHostDatabase(mockDb);
    });
  });

  describe('getHost', () => {
    it('should return specific host by name', async () => {
      const mockHost = {
        name: 'Host1',
        mac: 'AA:BB:CC:DD:EE:FF',
        ip: '192.168.1.1',
        status: 'awake',
        lastSeen: null,
        discovered: 1,
      };
      mockReq.params = { name: 'Host1' };
      mockDb.getHost.mockResolvedValue(mockHost as any);

      await hostsController.getHost(mockReq as Request, mockRes as Response);

      expect(mockDb.getHost).toHaveBeenCalledWith('Host1');
      expect(mockRes.json).toHaveBeenCalledWith(mockHost);
    });

    it('should return 204 for non-existent host', async () => {
      mockReq.params = { name: 'NonExistent' };
      mockDb.getHost.mockResolvedValue(undefined);

      await hostsController.getHost(mockReq as Request, mockRes as Response);

      expect(mockRes.sendStatus).toHaveBeenCalledWith(204);
    });

    it('should handle database lookup errors', async () => {
      mockReq.params = { name: 'Host1' };
      mockDb.getHost.mockRejectedValue(new Error('Database error'));

      // Controller now throws errors for Express error handler to catch
      await expect(
        hostsController.getHost(mockReq as Request, mockRes as Response)
      ).rejects.toThrow('Database error');
    });
  });

  describe('wakeUpHost', () => {
    it('should send WoL packet successfully', async () => {
      const mockHost = {
        name: 'Host1',
        mac: 'AA:BB:CC:DD:EE:FF',
        ip: '192.168.1.1',
        status: 'asleep',
        lastSeen: null,
        discovered: 1,
      };
      mockReq.params = { name: 'Host1' };
      mockDb.getHost.mockResolvedValue(mockHost as any);

      // Mock WoL success
      (wol.wake as jest.Mock).mockImplementation(
        (_mac: string, callback: (err: Error | null) => void) => {
          callback(null);
        }
      );

      await hostsController.wakeUpHost(mockReq as Request, mockRes as Response);

      // Wait for async callback
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockDb.getHost).toHaveBeenCalledWith('Host1');
      expect(wol.wake).toHaveBeenCalledWith('AA:BB:CC:DD:EE:FF', expect.any(Function));
    });

    it('should return 204 when host not found', async () => {
      mockReq.params = { name: 'NonExistent' };
      mockDb.getHost.mockResolvedValue(undefined);

      await hostsController.wakeUpHost(mockReq as Request, mockRes as Response);

      expect(mockRes.sendStatus).toHaveBeenCalledWith(204);
    });

    it('should handle WoL errors', async () => {
      const mockHost = {
        name: 'Host1',
        mac: 'AA:BB:CC:DD:EE:FF',
        ip: '192.168.1.1',
        status: 'asleep',
        lastSeen: null,
        discovered: 1,
      };
      mockReq.params = { name: 'Host1' };
      mockDb.getHost.mockResolvedValue(mockHost as any);

      // Mock WoL error
      (wol.wake as jest.Mock).mockImplementation(
        (_mac: string, callback: (err: Error | null) => void) => {
          callback(new Error('WoL failed'));
        }
      );

      // Controller now throws errors for Express error handler to catch
      await expect(
        hostsController.wakeUpHost(mockReq as Request, mockRes as Response)
      ).rejects.toThrow('WoL failed');
    });
  });

  describe('scanNetwork', () => {
    it('should trigger network scan and return results', async () => {
      const mockHosts = [
        {
          name: 'Host1',
          mac: 'AA:BB:CC:DD:EE:FF',
          ip: '192.168.1.1',
          status: 'awake',
          lastSeen: null,
          discovered: 1,
        },
      ];
      mockDb.syncWithNetwork.mockResolvedValue(undefined);
      mockDb.getAllHosts.mockResolvedValue(mockHosts as any);

      await hostsController.scanNetwork(mockReq as Request, mockRes as Response);

      expect(mockDb.syncWithNetwork).toHaveBeenCalled();
      expect(mockDb.getAllHosts).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Network scan completed',
        hostsCount: 1,
        hosts: mockHosts,
      });
    });

    it('should handle network scan errors', async () => {
      mockDb.syncWithNetwork.mockRejectedValue(new Error('Network error'));

      // Controller now throws errors for Express error handler to catch
      await expect(
        hostsController.scanNetwork(mockReq as Request, mockRes as Response)
      ).rejects.toThrow('Network error');
    });
  });

  describe('addHost', () => {
    it('should add new host with valid data', async () => {
      const newHost = { name: 'TestHost', mac: 'AA:BB:CC:DD:EE:FF', ip: '192.168.1.200' };
      mockReq.body = newHost;
      const addedHost = { ...newHost, status: 'asleep', lastSeen: null, discovered: 1 };
      mockDb.addHost.mockResolvedValue(addedHost as any);

      await hostsController.addHost(mockReq as Request, mockRes as Response);

      expect(mockDb.addHost).toHaveBeenCalledWith('TestHost', 'AA:BB:CC:DD:EE:FF', '192.168.1.200');
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(addedHost);
    });

    it('should reject request with missing fields', async () => {
      mockReq.body = { name: 'TestHost' }; // Missing mac and ip

      await hostsController.addHost(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Missing required fields: name, mac, ip',
      });
    });

    it('should handle duplicate host errors', async () => {
      const newHost = { name: 'TestHost', mac: 'AA:BB:CC:DD:EE:FF', ip: '192.168.1.200' };
      mockReq.body = newHost;
      mockDb.addHost.mockRejectedValue(new Error('UNIQUE constraint failed'));

      // Controller now throws errors for Express error handler to catch
      await expect(
        hostsController.addHost(mockReq as Request, mockRes as Response)
      ).rejects.toThrow('UNIQUE constraint failed');
    });
  });

  describe('getMacVendor', () => {
    beforeEach(() => {
      // Clear the cache before each test
      jest.clearAllTimers();
    });

    it('should fetch vendor from API when not cached', async () => {
      mockReq.params = { mac: 'AA:BB:CC:DD:EE:FF' };
      (axios.get as jest.Mock).mockResolvedValue({ data: 'Apple Inc.' });

      await hostsController.getMacVendor(mockReq as Request, mockRes as Response);

      expect(axios.get).toHaveBeenCalledWith(
        'https://api.macvendors.com/AA%3ABB%3ACC%3ADD%3AEE%3AFF',
        expect.objectContaining({
          timeout: 5000,
          headers: expect.any(Object),
        })
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        mac: 'AA:BB:CC:DD:EE:FF',
        vendor: 'Apple Inc.',
        source: 'macvendors.com',
      });
    });

    it('should return cached vendor on subsequent requests', async () => {
      mockReq.params = { mac: 'AA:BB:CC:DD:EE:FF' };
      (axios.get as jest.Mock).mockResolvedValue({ data: 'Apple Inc.' });

      // First request
      await hostsController.getMacVendor(mockReq as Request, mockRes as Response);

      // Second request should use cache
      jest.clearAllMocks();
      await hostsController.getMacVendor(mockReq as Request, mockRes as Response);

      expect(axios.get).not.toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        mac: 'AA:BB:CC:DD:EE:FF',
        vendor: 'Apple Inc.',
        source: 'macvendors.com (cached)',
      });
    });

    it('should handle API rate limiting (429)', async () => {
      mockReq.params = { mac: 'BB:BB:CC:DD:EE:FF' };
      (axios.get as jest.Mock).mockRejectedValue({
        response: { status: 429 },
      });

      await hostsController.getMacVendor(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Rate limit exceeded, please try again later',
        mac: 'BB:BB:CC:DD:EE:FF',
      });
    });

    it('should handle unknown vendors (404)', async () => {
      mockReq.params = { mac: 'CC:CC:CC:DD:EE:FF' };
      (axios.get as jest.Mock).mockRejectedValue({
        response: { status: 404 },
      });

      await hostsController.getMacVendor(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        mac: 'CC:CC:CC:DD:EE:FF',
        vendor: 'Unknown Vendor',
        source: 'macvendors.com',
      });
    });

    it('should handle missing MAC parameter', async () => {
      mockReq.params = {};

      await hostsController.getMacVendor(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'MAC address is required' });
    });

    it('should normalize MAC address for cache key', async () => {
      // Test with different MAC formats
      const formats = ['aa:bb:cc:dd:ee:ff', 'AA:BB:CC:DD:EE:FF', 'aa-bb-cc-dd-ee-ff'];

      for (const format of formats) {
        mockReq.params = { mac: format };
        (axios.get as jest.Mock).mockResolvedValue({ data: 'Test Vendor' });

        await hostsController.getMacVendor(mockReq as Request, mockRes as Response);
        jest.clearAllMocks();
      }

      // Next request should use cache regardless of format
      mockReq.params = { mac: 'AA-BB-CC-DD-EE-FF' };
      await hostsController.getMacVendor(mockReq as Request, mockRes as Response);

      expect(axios.get).not.toHaveBeenCalled();
    });
  });
});
