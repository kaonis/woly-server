/**
 * Tests for HostAggregator service
 */

import { HostAggregator } from '../hostAggregator';
import db from '../../database/connection';
import { NodeModel } from '../../models/Node';
import { PROTOCOL_VERSION } from '@kaonis/woly-protocol';


describe('HostAggregator', () => {
  let hostAggregator: HostAggregator;

  beforeAll(async () => {
    await db.connect();
  });

  beforeEach(async () => {
    hostAggregator = new HostAggregator();
    
    // Clean up test data
    await db.query('DELETE FROM aggregated_hosts WHERE node_id LIKE $1', ['test-node-%']);
    await db.query('DELETE FROM nodes WHERE id LIKE $1', ['test-node-%']);
    
    // Register test nodes so foreign key constraints are satisfied
    const testNodes = [
      { nodeId: 'test-node-1', name: 'Test Node 1', location: 'Test Location', authToken: 'token1' },
      { nodeId: 'test-node-2', name: 'Test Node 2', location: 'Office', authToken: 'token2' },
      { nodeId: 'test-node-3', name: 'Test Node 3', location: 'Lab', authToken: 'token3' },
      { nodeId: 'test-node-4', name: 'Test Node 4', location: 'Home', authToken: 'token4' },
      { nodeId: 'test-node-5', name: 'Test Node 5', location: 'Data Center', authToken: 'token5' },
      { nodeId: 'test-node-6', name: 'Test Node 6', location: 'Remote Site', authToken: 'token6' },
      { nodeId: 'test-node-7', name: 'Test Node 7', location: 'Branch Office', authToken: 'token7' },
    ];
    
    for (const node of testNodes) {
      await NodeModel.register({
        ...node,
        metadata: {
          version: '1.0.0',
          platform: 'test',
          protocolVersion: PROTOCOL_VERSION,
          networkInfo: { subnet: '192.168.1.0/24', gateway: '192.168.1.1' }
        }
      });
    }
  });

  afterAll(async () => {
    await db.close();
  });

  describe('onHostDiscovered', () => {
    it('should insert new host on discovery', async () => {
      const event = {
        nodeId: 'test-node-1',
        location: 'Test Location',
        host: {
          name: 'test-host-1',
          mac: 'AA:BB:CC:DD:EE:01',
          ip: '192.168.1.101',
          status: 'awake' as const,
          lastSeen: new Date().toISOString(),
          discovered: 1,
          pingResponsive: 1,
        },
      };

      let emittedEvent: any = null;
      hostAggregator.on('host-added', (data) => {
        emittedEvent = data;
      });

      await hostAggregator.onHostDiscovered(event);

      expect(emittedEvent).not.toBeNull();
      expect(emittedEvent.nodeId).toBe('test-node-1');
      expect(emittedEvent.host.name).toBe('test-host-1');
      expect(emittedEvent.fullyQualifiedName).toBe('test-host-1@Test-Location-test-node-1');

      // Verify it was inserted
      const host = await hostAggregator.getHostByFQN('test-host-1@Test-Location-test-node-1');
      expect(host).not.toBeNull();
      expect(host!.name).toBe('test-host-1');
      expect(host!.mac).toBe('AA:BB:CC:DD:EE:01');
    });

    it('should update existing host on rediscovery', async () => {
      // First discovery
      await hostAggregator.onHostDiscovered({
        nodeId: 'test-node-1',
        location: 'Test Location',
        host: {
          name: 'test-host-update',
          mac: 'AA:BB:CC:DD:EE:99',
          ip: '192.168.1.102',
          status: 'awake' as const,
          lastSeen: new Date().toISOString(),
          discovered: 1,
          pingResponsive: 1,
        },
      });

      // Verify first insertion
      const firstCheck = await hostAggregator.getHostByFQN('test-host-update@Test-Location-test-node-1');
      expect(firstCheck).not.toBeNull();
      expect(firstCheck!.ip).toBe('192.168.1.102');
      expect(firstCheck!.status).toBe('awake');

      // Second discovery with updated data
      await hostAggregator.onHostDiscovered({
        nodeId: 'test-node-1',
        location: 'Test Location',
        host: {
          name: 'test-host-update',
          mac: 'AA:BB:CC:DD:EE:99',
          ip: '192.168.1.202',
          status: 'asleep' as const,
          lastSeen: new Date().toISOString(),
          discovered: 1,
          pingResponsive: 1,
        },
      });

      // Verify update
      const host = await hostAggregator.getHostByFQN('test-host-update@Test-Location-test-node-1');
      expect(host).not.toBeNull();
      expect(host!.ip).toBe('192.168.1.202');
      expect(host!.status).toBe('asleep');
    });

    it('should handle errors gracefully', async () => {
      // Force a deterministic DB failure for this error-path test.
      const querySpy = jest.spyOn(db, 'query').mockRejectedValueOnce(new Error('forced-db-failure'));
      const event = {
        nodeId: 'test-node-1',
        location: 'Test Location',
        host: {
          name: 'test-host',
          mac: 'AA:BB:CC:DD:EE:FF',
          ip: '192.168.1.100',
          status: 'awake' as const,
          lastSeen: new Date().toISOString(),
        } as any,
      };

      try {
        await expect(hostAggregator.onHostDiscovered(event)).rejects.toThrow('forced-db-failure');
      } finally {
        querySpy.mockRestore();
      }
    });
  });

  describe('onHostUpdated', () => {
    it('should update existing host', async () => {
      const event = {
        nodeId: 'test-node-1',
        location: 'Test Location',
        host: {
          name: 'test-host-3',
          mac: 'AA:BB:CC:DD:EE:03',
          ip: '192.168.1.103',
          status: 'awake' as const,
          lastSeen: new Date().toISOString(),
          discovered: 1,
          pingResponsive: 1,
        },
      };

      // Insert first
      await hostAggregator.onHostDiscovered(event);

      let emittedEvent: any = null;
      hostAggregator.on('host-updated', (data) => {
        emittedEvent = data;
      });

      // Update with new status
      const updatedEvent = {
        ...event,
        host: {
          ...event.host,
          status: 'asleep' as const,
        },
      };
      await hostAggregator.onHostUpdated(updatedEvent);

      expect(emittedEvent).not.toBeNull();
      expect(emittedEvent.host.status).toBe('asleep');
    });

    it('should treat update as discovery if host not found', async () => {
      const event = {
        nodeId: 'test-node-1',
        location: 'Test Location',
        host: {
          name: 'test-host-4',
          mac: 'AA:BB:CC:DD:EE:04',
          ip: '192.168.1.104',
          status: 'awake' as const,
          lastSeen: new Date().toISOString(),
          discovered: 1,
          pingResponsive: 1,
        },
      };

      await hostAggregator.onHostUpdated(event);

      const host = await hostAggregator.getHostByFQN('test-host-4@Test-Location-test-node-1');
      expect(host).not.toBeNull();
    });

    it('should not create a duplicate when a host is renamed (same MAC)', async () => {
      // Initial discovery uses a default-style name (as node-agent does when hostname is missing).
      await hostAggregator.onHostDiscovered({
        nodeId: 'test-node-2',
        location: 'Home Office',
        host: {
          name: 'device-192-168-1-1',
          mac: 'AA:BB:CC:DD:EE:10',
          ip: '192.168.1.1',
          status: 'awake' as const,
          lastSeen: new Date().toISOString(),
          discovered: 1,
          pingResponsive: 1,
        },
      });

      // Rename event: same MAC, new name.
      await hostAggregator.onHostUpdated({
        nodeId: 'test-node-2',
        location: 'Home Office',
        host: {
          name: 'Router',
          mac: 'AA:BB:CC:DD:EE:10',
          ip: '192.168.1.1',
          status: 'awake' as const,
          lastSeen: new Date().toISOString(),
          discovered: 1,
          pingResponsive: 1,
        },
      });

      // Old FQN should no longer resolve.
      const old = await hostAggregator.getHostByFQN('device-192-168-1-1@Home-Office-test-node-2');
      expect(old).toBeNull();

      // New FQN should resolve.
      const renamed = await hostAggregator.getHostByFQN('Router@Home-Office-test-node-2');
      expect(renamed).not.toBeNull();
      expect(renamed!.mac).toBe('AA:BB:CC:DD:EE:10');

      // Ensure only one row exists for (node, mac).
      const countResult = await db.query(
        'SELECT COUNT(*) as count FROM aggregated_hosts WHERE node_id = $1 AND mac = $2',
        ['test-node-2', 'AA:BB:CC:DD:EE:10']
      );
      expect(parseInt(countResult.rows[0].count, 10)).toBe(1);
    });
  });

  describe('onHostRemoved', () => {
    it('should remove host from database', async () => {
      const event = {
        nodeId: 'test-node-1',
        location: 'Test Location',
        host: {
          name: 'test-host-5',
          mac: 'AA:BB:CC:DD:EE:05',
          ip: '192.168.1.105',
          status: 'awake' as const,
          lastSeen: new Date().toISOString(),
          discovered: 1,
          pingResponsive: 1,
        },
      };

      await hostAggregator.onHostDiscovered(event);

      let emittedEvent: any = null;
      hostAggregator.on('host-removed', (data) => {
        emittedEvent = data;
      });

      await hostAggregator.onHostRemoved({
        nodeId: 'test-node-1',
        name: 'test-host-5',
      });

      expect(emittedEvent).not.toBeNull();

      const host = await hostAggregator.getHostByFQN('test-host-5@Test-Location-test-node-1');
      expect(host).toBeNull();
    });

    it('should remove legacy duplicates with the same MAC', async () => {
      // Insert duplicate rows directly to simulate legacy data (same node+mac, different names).
      const nodeId = 'test-node-3';
      const location = 'Lab';

      await db.query(
        `INSERT INTO aggregated_hosts
          (node_id, name, mac, ip, status, last_seen, location, fully_qualified_name, discovered, ping_responsive)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          nodeId,
          'device-192-168-1-1',
          'AA:BB:CC:DD:EE:20',
          '192.168.1.1',
          'awake',
          new Date().toISOString(),
          location,
          'device-192-168-1-1@Lab-test-node-3',
          1,
          1,
        ]
      );

      await db.query(
        `INSERT INTO aggregated_hosts
          (node_id, name, mac, ip, status, last_seen, location, fully_qualified_name, discovered, ping_responsive)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          nodeId,
          'Router',
          'AA:BB:CC:DD:EE:20',
          '192.168.1.1',
          'awake',
          new Date().toISOString(),
          location,
          'Router@Lab-test-node-3',
          1,
          1,
        ]
      );

      // Remove one by name; expect all rows with same MAC are deleted.
      await hostAggregator.onHostRemoved({ nodeId, name: 'Router' });

      const countResult = await db.query(
        'SELECT COUNT(*) as count FROM aggregated_hosts WHERE node_id = $1 AND mac = $2',
        [nodeId, 'AA:BB:CC:DD:EE:20']
      );
      expect(parseInt(countResult.rows[0].count, 10)).toBe(0);
    });

    it('should handle removal of non-existent host', async () => {
      await hostAggregator.onHostRemoved({
        nodeId: 'test-node-1',
        name: 'non-existent',
      });
      // Should not throw
    });
  });

  describe('markNodeHostsUnreachable', () => {
    it('should mark all node hosts as asleep', async () => {
      const events = [
        {
          nodeId: 'test-node-2',
          location: 'Office',
          host: {
            name: 'test-host-6',
            mac: 'AA:BB:CC:DD:EE:06',
            ip: '192.168.1.106',
            status: 'awake' as const,
            lastSeen: new Date().toISOString(),
            discovered: 1,
            pingResponsive: 1,
          },
        },
        {
          nodeId: 'test-node-2',
          location: 'Office',
          host: {
            name: 'test-host-7',
            mac: 'AA:BB:CC:DD:EE:07',
            ip: '192.168.1.107',
            status: 'awake' as const,
            lastSeen: new Date().toISOString(),
            discovered: 1,
            pingResponsive: 1,
          },
        },
      ];

      for (const event of events) {
        await hostAggregator.onHostDiscovered(event);
      }

      await hostAggregator.markNodeHostsUnreachable('test-node-2');

      const hosts = await hostAggregator.getHostsByNode('test-node-2');
      expect(hosts.every(h => h.status === 'asleep')).toBe(true);
    });
  });

  describe('removeNodeHosts', () => {
    it('should remove all hosts for a node', async () => {
      const event = {
        nodeId: 'test-node-3',
        location: 'Lab',
        host: {
          name: 'test-host-8',
          mac: 'AA:BB:CC:DD:EE:08',
          ip: '192.168.1.108',
          status: 'awake' as const,
          lastSeen: new Date().toISOString(),
          discovered: 1,
          pingResponsive: 1,
        },
      };

      await hostAggregator.onHostDiscovered(event);
      await hostAggregator.removeNodeHosts('test-node-3');

      const hosts = await hostAggregator.getHostsByNode('test-node-3');
      expect(hosts.length).toBe(0);
    });
  });

  describe('getAllHosts', () => {
    it('should return all aggregated hosts', async () => {
      const event = {
        nodeId: 'test-node-4',
        location: 'Home',
        host: {
          name: 'test-host-9',
          mac: 'AA:BB:CC:DD:EE:09',
          ip: '192.168.1.109',
          status: 'awake' as const,
          lastSeen: new Date().toISOString(),
          discovered: 1,
          pingResponsive: 1,
        },
      };

      await hostAggregator.onHostDiscovered(event);
      const hosts = await hostAggregator.getAllHosts();

      expect(hosts.length).toBeGreaterThan(0);
      expect(hosts.some(h => h.name === 'test-host-9')).toBe(true);
    });
  });

  describe('getHostsByNode', () => {
    it('should return hosts for specific node', async () => {
      const event = {
        nodeId: 'test-node-5',
        location: 'Data Center',
        host: {
          name: 'test-host-10',
          mac: 'AA:BB:CC:DD:EE:10',
          ip: '192.168.1.110',
          status: 'awake' as const,
          lastSeen: new Date().toISOString(),
          discovered: 1,
          pingResponsive: 1,
        },
      };

      await hostAggregator.onHostDiscovered(event);
      const hosts = await hostAggregator.getHostsByNode('test-node-5');

      expect(hosts.length).toBeGreaterThan(0);
      expect(hosts[0].nodeId).toBe('test-node-5');
    });

    it('should return empty array for node with no hosts', async () => {
      const hosts = await hostAggregator.getHostsByNode('non-existent-node');
      expect(hosts.length).toBe(0);
    });
  });

  describe('getHostByFQN', () => {
    it('should return host by fully qualified name', async () => {
      const event = {
        nodeId: 'test-node-6',
        location: 'Remote Site',
        host: {
          name: 'test-host-11',
          mac: 'AA:BB:CC:DD:EE:11',
          ip: '192.168.1.111',
          status: 'awake' as const,
          lastSeen: new Date().toISOString(),
          discovered: 1,
          pingResponsive: 1,
        },
      };

      await hostAggregator.onHostDiscovered(event);
      const host = await hostAggregator.getHostByFQN('test-host-11@Remote-Site-test-node-6');

      expect(host).not.toBeNull();
      expect(host!.name).toBe('test-host-11');
      expect(host!.location).toBe('Remote Site');
    });

    it('should return null for non-existent FQN', async () => {
      const host = await hostAggregator.getHostByFQN('non-existent@location');
      expect(host).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return aggregated statistics', async () => {
      const events = [
        {
          nodeId: 'test-node-7',
          location: 'Stats Test',
          host: {
            name: 'test-host-12',
            mac: 'AA:BB:CC:DD:EE:12',
            ip: '192.168.1.112',
            status: 'awake' as const,
            lastSeen: new Date().toISOString(),
            discovered: 1,
            pingResponsive: 1,
          },
        },
        {
          nodeId: 'test-node-7',
          location: 'Stats Test',
          host: {
            name: 'test-host-13',
            mac: 'AA:BB:CC:DD:EE:13',
            ip: '192.168.1.113',
            status: 'asleep' as const,
            lastSeen: new Date().toISOString(),
            discovered: 1,
            pingResponsive: 0,
          },
        },
      ];

      for (const event of events) {
        await hostAggregator.onHostDiscovered(event);
      }

      const stats = await hostAggregator.getStats();

      expect(stats.total).toBeGreaterThanOrEqual(2);
      expect(stats.awake).toBeGreaterThanOrEqual(1);
      expect(stats.asleep).toBeGreaterThanOrEqual(1);
      expect(stats.byLocation['Stats Test']).toBeDefined();
    });
  });
});
