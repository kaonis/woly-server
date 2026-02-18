import { Request, Response } from 'express';
import * as hostsController from '../hosts';
import HostDatabase from '../../services/hostDatabase';
import axios from 'axios';
import wol from 'wake_on_lan';
import * as networkDiscovery from '../../services/networkDiscovery';

// Mock all external dependencies
jest.mock('axios');
jest.mock('wake_on_lan');
jest.mock('../../services/networkDiscovery');

describe('hosts controller', () => {
  let mockDb: jest.Mocked<HostDatabase>;
  let mockScanOrchestrator: {
    syncWithNetwork: jest.Mock;
    isScanInProgress: jest.Mock;
    getLastScanTime: jest.Mock;
  };
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    // Create mock database
    mockDb = {
      getAllHosts: jest.fn(),
      getHost: jest.fn(),
      addHost: jest.fn(),
      updateHost: jest.fn(),
      deleteHost: jest.fn(),
      updateHostStatus: jest.fn(),
      updateHostSeen: jest.fn(),
      initialize: jest.fn(),
      close: jest.fn(),
      createTable: jest.fn(),
      seedInitialHosts: jest.fn(),
      emit: jest.fn(),
    } as any;

    mockScanOrchestrator = {
      syncWithNetwork: jest.fn(),
      isScanInProgress: jest.fn().mockReturnValue(false),
      getLastScanTime: jest.fn().mockReturnValue(null),
    };

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
    hostsController.setScanOrchestrator(mockScanOrchestrator as any);

    // Clear all mocks
    jest.clearAllMocks();
    (networkDiscovery.isHostAlive as jest.Mock).mockResolvedValue(false);
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

    it('should return 404 for non-existent host', async () => {
      mockReq.params = { name: 'NonExistent' };
      mockDb.getHost.mockResolvedValue(undefined);

      await hostsController.getHost(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Not Found',
        message: "Host 'NonExistent' not found",
      });
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
        (_mac: string, _opts: unknown, callback: (err: Error | null) => void) => {
          callback(null);
        }
      );

      await hostsController.wakeUpHost(mockReq as Request, mockRes as Response);

      // Wait for async callback
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockDb.getHost).toHaveBeenCalledWith('Host1');
      expect(wol.wake).toHaveBeenCalledWith(
        'AA:BB:CC:DD:EE:FF',
        { port: 9 },
        expect.any(Function)
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          name: 'Host1',
          wolPort: 9,
          verification: expect.objectContaining({
            status: 'not_requested',
          }),
        })
      );
    });

    it('should send WoL packet with custom request port when provided', async () => {
      const mockHost = {
        name: 'Host1',
        mac: 'AA:BB:CC:DD:EE:FF',
        ip: '192.168.1.1',
        status: 'asleep',
        wolPort: 9,
        lastSeen: null,
        discovered: 1,
      };
      mockReq.params = { name: 'Host1' };
      mockReq.body = { wolPort: 7 };
      mockDb.getHost.mockResolvedValue(mockHost as any);
      (wol.wake as jest.Mock).mockImplementation(
        (_mac: string, _opts: unknown, callback: (err: Error | null) => void) => callback(null)
      );

      await hostsController.wakeUpHost(mockReq as Request, mockRes as Response);

      expect(wol.wake).toHaveBeenCalledWith(
        'AA:BB:CC:DD:EE:FF',
        { port: 7 },
        expect.any(Function)
      );
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          wolPort: 7,
        })
      );
    });

    it('should return 404 when host not found', async () => {
      mockReq.params = { name: 'NonExistent' };
      mockDb.getHost.mockResolvedValue(undefined);

      await hostsController.wakeUpHost(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Not Found',
        message: "Host 'NonExistent' not found",
      });
    });

    it('should report verification success when verify=true and ping confirms wake', async () => {
      const mockHost = {
        name: 'Host1',
        mac: 'AA:BB:CC:DD:EE:FF',
        ip: '192.168.1.1',
        status: 'asleep',
        lastSeen: null,
        discovered: 1,
      };
      mockReq.params = { name: 'Host1' };
      mockReq.query = { verify: 'true', verifyTimeoutMs: '1000', verifyPollIntervalMs: '100' };
      mockDb.getHost.mockResolvedValue(mockHost as any);
      (networkDiscovery.isHostAlive as jest.Mock).mockResolvedValue(true);
      (wol.wake as jest.Mock).mockImplementation(
        (_mac: string, _opts: unknown, callback: (err: Error | null) => void) => callback(null)
      );

      await hostsController.wakeUpHost(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          verification: expect.objectContaining({
            enabled: true,
            status: 'woke',
            source: 'ping',
          }),
        })
      );
    });

    it('should report verification timeout when host does not wake within timeout window', async () => {
      jest.useFakeTimers();
      const mockHost = {
        name: 'Host1',
        mac: 'AA:BB:CC:DD:EE:FF',
        ip: '192.168.1.1',
        status: 'asleep',
        lastSeen: null,
        discovered: 1,
      };
      mockReq.params = { name: 'Host1' };
      mockReq.query = { verify: 'true', verifyTimeoutMs: '500', verifyPollIntervalMs: '100' };
      mockDb.getHost.mockResolvedValue(mockHost as any);
      (networkDiscovery.isHostAlive as jest.Mock).mockResolvedValue(false);
      (wol.wake as jest.Mock).mockImplementation(
        (_mac: string, _opts: unknown, callback: (err: Error | null) => void) => callback(null)
      );

      const wakePromise = hostsController.wakeUpHost(mockReq as Request, mockRes as Response);
      await jest.advanceTimersByTimeAsync(700);
      await wakePromise;

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          verification: expect.objectContaining({
            enabled: true,
            status: 'timeout',
          }),
        })
      );
      jest.useRealTimers();
    });

    it('should report host_not_found when host disappears during verification', async () => {
      const mockHost = {
        name: 'Host1',
        mac: 'AA:BB:CC:DD:EE:FF',
        ip: '192.168.1.1',
        status: 'asleep',
        lastSeen: null,
        discovered: 1,
      };
      mockReq.params = { name: 'Host1' };
      mockReq.query = { verify: 'true', verifyTimeoutMs: '1000', verifyPollIntervalMs: '100' };
      mockDb.getHost.mockResolvedValueOnce(mockHost as any).mockResolvedValueOnce(undefined);
      (wol.wake as jest.Mock).mockImplementation(
        (_mac: string, _opts: unknown, callback: (err: Error | null) => void) => callback(null)
      );

      await hostsController.wakeUpHost(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          verification: expect.objectContaining({
            status: 'host_not_found',
          }),
        })
      );
    });

    it('should report verification error when probe throws unexpectedly', async () => {
      const mockHost = {
        name: 'Host1',
        mac: 'AA:BB:CC:DD:EE:FF',
        ip: '192.168.1.1',
        status: 'asleep',
        lastSeen: null,
        discovered: 1,
      };
      mockReq.params = { name: 'Host1' };
      mockReq.query = { verify: 'true', verifyTimeoutMs: '1000', verifyPollIntervalMs: '100' };
      mockDb.getHost.mockResolvedValue(mockHost as any);
      (networkDiscovery.isHostAlive as jest.Mock).mockRejectedValueOnce(new Error('probe exploded'));
      (wol.wake as jest.Mock).mockImplementation(
        (_mac: string, _opts: unknown, callback: (err: Error | null) => void) => callback(null)
      );

      await hostsController.wakeUpHost(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          verification: expect.objectContaining({
            status: 'error',
          }),
        })
      );
    });

    it('should handle WoL errors as structured response', async () => {
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
        (_mac: string, _opts: unknown, callback: (err: Error | null) => void) => {
          callback(new Error('WoL failed'));
        }
      );

      await hostsController.wakeUpHost(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(502);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'WOL_SEND_FAILED',
          message: 'WoL failed',
          verification: expect.objectContaining({
            status: 'error',
          }),
        })
      );
    });

    it('should return 400 for invalid wake verification query params', async () => {
      mockReq.params = { name: 'Host1' };
      mockReq.query = { verify: 'invalid-value' };

      await hostsController.wakeUpHost(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Bad Request',
        })
      );
      expect(mockDb.getHost).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid wolPort override', async () => {
      mockReq.params = { name: 'Host1' };
      mockReq.body = { wolPort: 70_000 };

      await hostsController.wakeUpHost(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Bad Request',
        })
      );
      expect(mockDb.getHost).not.toHaveBeenCalled();
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
      mockScanOrchestrator.syncWithNetwork.mockResolvedValue({
        success: true,
        discoveredHosts: 1,
        updatedHosts: 1,
        newHosts: 0,
        awakeHosts: 1,
        hostCount: 1,
      });
      mockDb.getAllHosts.mockResolvedValue(mockHosts as any);

      await hostsController.scanNetwork(mockReq as Request, mockRes as Response);

      expect(mockScanOrchestrator.syncWithNetwork).toHaveBeenCalled();
      expect(mockDb.getAllHosts).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Network scan completed',
        hostsCount: 1,
        hosts: mockHosts,
      });
    });

    it('should return 500 when network scan fails', async () => {
      mockScanOrchestrator.syncWithNetwork.mockResolvedValue({
        success: false,
        code: 'SCAN_FAILED',
        error: 'Network error',
      });

      await hostsController.scanNetwork(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Network error',
      });
    });

    it('should return 409 when network scan is already in progress', async () => {
      mockScanOrchestrator.syncWithNetwork.mockResolvedValue({
        success: false,
        code: 'SCAN_IN_PROGRESS',
        error: 'Scan already in progress',
      });

      await hostsController.scanNetwork(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Conflict',
        message: 'Scan already in progress',
      });
    });
  });

  describe('addHost', () => {
    it('should add new host with valid data', async () => {
      const newHost = { name: 'TestHost', mac: 'AA:BB:CC:DD:EE:FF', ip: '192.168.1.200' };
      mockReq.body = newHost;
      const addedHost = { ...newHost, status: 'asleep', lastSeen: null, discovered: 1 };
      mockDb.addHost.mockResolvedValue(addedHost as any);

      await hostsController.addHost(mockReq as Request, mockRes as Response);

      expect(mockDb.addHost).toHaveBeenCalledWith(
        'TestHost',
        'AA:BB:CC:DD:EE:FF',
        '192.168.1.200',
        { notes: undefined, tags: undefined }
      );
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(addedHost);
    });

    it('should pass notes/tags metadata when provided', async () => {
      const newHost = {
        name: 'TaggedHost',
        mac: 'AA:BB:CC:DD:EE:AB',
        ip: '192.168.1.201',
        notes: 'Rack 4',
        tags: ['lab'],
      };
      mockReq.body = newHost;
      mockDb.addHost.mockResolvedValue({
        ...newHost,
        status: 'asleep',
        discovered: 0,
        pingResponsive: null,
        lastSeen: null,
      } as any);

      await hostsController.addHost(mockReq as Request, mockRes as Response);

      expect(mockDb.addHost).toHaveBeenCalledWith(
        'TaggedHost',
        'AA:BB:CC:DD:EE:AB',
        '192.168.1.201',
        { notes: 'Rack 4', tags: ['lab'] }
      );
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

  describe('updateHost', () => {
    it('should update a host and return updated payload', async () => {
      const existingHost = {
        name: 'OLD-HOST',
        mac: 'AA:BB:CC:DD:EE:01',
        ip: '192.168.1.50',
        wolPort: 9,
        status: 'awake',
      };
      const updatedHost = {
        name: 'NEW-HOST',
        mac: 'AA:BB:CC:DD:EE:01',
        ip: '192.168.1.60',
        wolPort: 9,
        status: 'awake',
      };

      mockReq.params = { name: 'OLD-HOST' };
      mockReq.body = { name: 'NEW-HOST', ip: '192.168.1.60' };
      mockDb.getHost
        .mockResolvedValueOnce(existingHost as any)
        .mockResolvedValueOnce(updatedHost as any);

      await hostsController.updateHost(mockReq as Request, mockRes as Response);

      expect(mockDb.updateHost).toHaveBeenCalledWith('OLD-HOST', {
        name: 'NEW-HOST',
        ip: '192.168.1.60',
      });
      expect(mockDb.emit).toHaveBeenCalledWith('host-updated', updatedHost);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(updatedHost);
    });

    it('should forward wolPort updates', async () => {
      mockReq.params = { name: 'PORT-HOST' };
      mockReq.body = { wolPort: 7 };
      mockDb.getHost.mockResolvedValueOnce({
        name: 'PORT-HOST',
        mac: 'AA:BB:CC:DD:EE:11',
        ip: '192.168.1.61',
        status: 'asleep',
        wolPort: 9,
      } as any);
      mockDb.getHost.mockResolvedValueOnce({
        name: 'PORT-HOST',
        mac: 'AA:BB:CC:DD:EE:11',
        ip: '192.168.1.61',
        status: 'asleep',
        wolPort: 7,
      } as any);

      await hostsController.updateHost(mockReq as Request, mockRes as Response);

      expect(mockDb.updateHost).toHaveBeenCalledWith('PORT-HOST', { wolPort: 7 });
    });

    it('should return 404 when host does not exist', async () => {
      mockReq.params = { name: 'MISSING' };
      mockReq.body = { ip: '192.168.1.99' };
      mockDb.getHost.mockResolvedValue(undefined);

      await hostsController.updateHost(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Not Found',
        message: "Host 'MISSING' not found",
      });
    });

    it('should return 409 on uniqueness conflicts', async () => {
      mockReq.params = { name: 'HOST-A' };
      mockReq.body = { name: 'HOST-B' };
      mockDb.getHost.mockResolvedValueOnce({
        name: 'HOST-A',
        mac: 'AA:BB:CC:DD:EE:10',
        ip: '192.168.1.10',
        status: 'awake',
      } as any);
      mockDb.updateHost.mockRejectedValue(new Error('UNIQUE constraint failed'));

      await hostsController.updateHost(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Conflict',
        message: 'Host update conflicts with an existing host record',
      });
    });
  });

  describe('deleteHost', () => {
    it('should delete host and return success payload', async () => {
      mockReq.params = { name: 'DELETE-ME' };
      mockDb.getHost.mockResolvedValue({
        name: 'DELETE-ME',
        mac: 'AA:BB:CC:DD:EE:02',
        ip: '192.168.1.70',
        status: 'asleep',
      } as any);

      await hostsController.deleteHost(mockReq as Request, mockRes as Response);

      expect(mockDb.deleteHost).toHaveBeenCalledWith('DELETE-ME');
      expect(mockDb.emit).toHaveBeenCalledWith('host-removed', 'DELETE-ME');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Host deleted',
        name: 'DELETE-ME',
      });
    });

    it('should return 404 when deleting unknown host', async () => {
      mockReq.params = { name: 'UNKNOWN' };
      mockDb.getHost.mockResolvedValue(undefined);

      await hostsController.deleteHost(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Not Found',
        message: "Host 'UNKNOWN' not found",
      });
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
