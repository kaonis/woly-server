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
      expect(emittedEvent.fullyQualifiedName).toBe('test-host-1@Test%20Location-test-node-1');

      // Verify it was inserted
      const host = await hostAggregator.getHostByFQN('test-host-1@Test%20Location-test-node-1');
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
      const firstCheck = await hostAggregator.getHostByFQN('test-host-update@Test%20Location-test-node-1');
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
      const host = await hostAggregator.getHostByFQN('test-host-update@Test%20Location-test-node-1');
      expect(host).not.toBeNull();
      expect(host!.ip).toBe('192.168.1.202');
      expect(host!.status).toBe('asleep');
    });

    it('emits host-updated on rediscovery when meaningful fields change', async () => {
      const hostUpdated = jest.fn();
      hostAggregator.on('host-updated', hostUpdated);

      await hostAggregator.onHostDiscovered({
        nodeId: 'test-node-1',
        location: 'Test Location',
        host: {
          name: 'rediscovery-stream-host',
          mac: 'AA:BB:CC:DD:EE:88',
          ip: '192.168.1.188',
          status: 'awake' as const,
          lastSeen: '2026-02-18T10:00:00.000Z',
          discovered: 1,
          pingResponsive: 1,
        },
      });

      await hostAggregator.onHostDiscovered({
        nodeId: 'test-node-1',
        location: 'Test Location',
        host: {
          name: 'rediscovery-stream-host',
          mac: 'AA:BB:CC:DD:EE:88',
          ip: '192.168.1.188',
          status: 'asleep' as const,
          lastSeen: '2026-02-18T10:05:00.000Z',
          discovered: 1,
          pingResponsive: 0,
        },
      });

      expect(hostUpdated).toHaveBeenCalledWith(
        expect.objectContaining({
          nodeId: 'test-node-1',
          host: expect.objectContaining({
            name: 'rediscovery-stream-host',
            status: 'asleep',
          }),
        })
      );
    });

    it('does not emit host-updated on rediscovery when only lastSeen changes', async () => {
      const hostUpdated = jest.fn();
      hostAggregator.on('host-updated', hostUpdated);

      await hostAggregator.onHostDiscovered({
        nodeId: 'test-node-1',
        location: 'Test Location',
        host: {
          name: 'rediscovery-lastseen-host',
          mac: 'AA:BB:CC:DD:EE:89',
          ip: '192.168.1.189',
          status: 'awake' as const,
          lastSeen: '2026-02-18T10:00:00.000Z',
          discovered: 1,
          pingResponsive: 1,
        },
      });

      await hostAggregator.onHostDiscovered({
        nodeId: 'test-node-1',
        location: 'Test Location',
        host: {
          name: 'rediscovery-lastseen-host',
          mac: 'AA:BB:CC:DD:EE:89',
          ip: '192.168.1.189',
          status: 'awake' as const,
          lastSeen: '2026-02-18T10:05:00.000Z',
          discovered: 1,
          pingResponsive: 1,
        },
      });

      expect(hostUpdated).not.toHaveBeenCalled();
    });

    it('should persist host notes/tags metadata', async () => {
      await hostAggregator.onHostDiscovered({
        nodeId: 'test-node-1',
        location: 'Test Location',
        host: {
          name: 'metadata-host',
          mac: 'AA:BB:CC:DD:EE:42',
          ip: '192.168.1.142',
          status: 'awake' as const,
          lastSeen: new Date().toISOString(),
          discovered: 1,
          pingResponsive: 1,
          notes: 'Top-of-rack switch',
          tags: ['network', 'critical'],
        },
      });

      const host = await hostAggregator.getHostByFQN('metadata-host@Test%20Location-test-node-1');
      expect(host).not.toBeNull();
      expect(host!.notes).toBe('Top-of-rack switch');
      expect(host!.tags).toEqual(['network', 'critical']);
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

      const host = await hostAggregator.getHostByFQN('test-host-4@Test%20Location-test-node-1');
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
      const old = await hostAggregator.getHostByFQN('device-192-168-1-1@Home%20Office-test-node-2');
      expect(old).toBeNull();

      // New FQN should resolve.
      const renamed = await hostAggregator.getHostByFQN('Router@Home%20Office-test-node-2');
      expect(renamed).not.toBeNull();
      expect(renamed!.mac).toBe('AA:BB:CC:DD:EE:10');

      // Ensure only one row exists for (node, mac).
      const countResult = await db.query<{ count: string | number }>(
        'SELECT COUNT(*) as count FROM aggregated_hosts WHERE node_id = $1 AND mac = $2',
        ['test-node-2', 'AA:BB:CC:DD:EE:10']
      );
      expect(parseInt(String(countResult.rows[0].count), 10)).toBe(1);
    });

    it('should reconcile by name when MAC has changed and no MAC match exists', async () => {
      await hostAggregator.onHostDiscovered({
        nodeId: 'test-node-2',
        location: 'Home Office',
        host: {
          name: 'printer',
          mac: 'AA:BB:CC:DD:EE:31',
          ip: '192.168.1.31',
          status: 'awake' as const,
          lastSeen: new Date().toISOString(),
          discovered: 1,
          pingResponsive: 1,
        },
      });

      await hostAggregator.onHostUpdated({
        nodeId: 'test-node-2',
        location: 'Home Office',
        host: {
          name: 'printer',
          mac: 'AA:BB:CC:DD:EE:99',
          ip: '192.168.1.32',
          status: 'asleep' as const,
          lastSeen: new Date().toISOString(),
          discovered: 1,
          pingResponsive: 0,
        },
      });

      const host = await hostAggregator.getHostByFQN('printer@Home%20Office-test-node-2');
      expect(host).not.toBeNull();
      expect(host!.mac).toBe('AA:BB:CC:DD:EE:99');
      expect(host!.status).toBe('asleep');
    });

    it('should delete duplicate rename target rows for same node+MAC', async () => {
      const nodeId = 'test-node-2';
      const location = 'Home Office';
      const mac = 'AA:BB:CC:DD:EE:77';

      await db.query(
        `INSERT INTO aggregated_hosts
          (node_id, name, mac, ip, status, last_seen, location, fully_qualified_name, discovered, ping_responsive)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          nodeId,
          'new-name',
          mac,
          '192.168.1.78',
          'awake',
          new Date().toISOString(),
          location,
          'new-name@Home%20Office-test-node-2',
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
          'old-name',
          mac,
          '192.168.1.77',
          'awake',
          new Date().toISOString(),
          location,
          'old-name@Home%20Office-test-node-2',
          1,
          1,
        ]
      );

      await hostAggregator.onHostUpdated({
        nodeId,
        location,
        host: {
          name: 'new-name',
          mac,
          ip: '192.168.1.79',
          status: 'asleep' as const,
          lastSeen: new Date().toISOString(),
          discovered: 1,
          pingResponsive: 1,
        },
      });

      const countResult = await db.query<{ count: string | number }>(
        'SELECT COUNT(*) as count FROM aggregated_hosts WHERE node_id = $1 AND mac = $2',
        [nodeId, mac]
      );
      expect(parseInt(String(countResult.rows[0].count), 10)).toBe(1);

      const old = await hostAggregator.getHostByFQN('old-name@Home%20Office-test-node-2');
      const renamed = await hostAggregator.getHostByFQN('new-name@Home%20Office-test-node-2');
      expect(old).toBeNull();
      expect(renamed).not.toBeNull();
      expect(renamed!.ip).toBe('192.168.1.79');
    });

    it('should surface errors while processing host updates', async () => {
      const querySpy = jest.spyOn(db, 'query').mockRejectedValueOnce(new Error('forced-update-failure'));
      try {
        await expect(
          hostAggregator.onHostUpdated({
            nodeId: 'test-node-1',
            location: 'Test Location',
            host: {
              name: 'test-host-update-error',
              mac: 'AA:BB:CC:DD:EE:AE',
              ip: '192.168.1.210',
              status: 'awake',
              lastSeen: new Date().toISOString(),
              discovered: 1,
              pingResponsive: 1,
            },
          })
        ).rejects.toThrow('forced-update-failure');
      } finally {
        querySpy.mockRestore();
      }
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

      const host = await hostAggregator.getHostByFQN('test-host-5@Test%20Location-test-node-1');
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

      const countResult = await db.query<{ count: string | number }>(
        'SELECT COUNT(*) as count FROM aggregated_hosts WHERE node_id = $1 AND mac = $2',
        [nodeId, 'AA:BB:CC:DD:EE:20']
      );
      expect(parseInt(String(countResult.rows[0].count), 10)).toBe(0);
    });

    it('should handle removal of non-existent host', async () => {
      await hostAggregator.onHostRemoved({
        nodeId: 'test-node-1',
        name: 'non-existent',
      });
      // Should not throw
    });

    it('should surface errors while removing a host', async () => {
      const querySpy = jest.spyOn(db, 'query').mockRejectedValueOnce(new Error('forced-remove-failure'));
      try {
        await expect(
          hostAggregator.onHostRemoved({
            nodeId: 'test-node-1',
            name: 'host-remove-error',
          })
        ).rejects.toThrow('forced-remove-failure');
      } finally {
        querySpy.mockRestore();
      }
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

    it('should surface errors while marking node hosts unreachable', async () => {
      const querySpy = jest.spyOn(db, 'query').mockRejectedValueOnce(new Error('forced-unreachable-failure'));
      try {
        await expect(hostAggregator.markNodeHostsUnreachable('test-node-2')).rejects.toThrow(
          'forced-unreachable-failure'
        );
      } finally {
        querySpy.mockRestore();
      }
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

    it('should surface errors while removing all node hosts', async () => {
      const querySpy = jest.spyOn(db, 'query').mockRejectedValueOnce(new Error('forced-remove-node-failure'));
      try {
        await expect(hostAggregator.removeNodeHosts('test-node-3')).rejects.toThrow(
          'forced-remove-node-failure'
        );
      } finally {
        querySpy.mockRestore();
      }
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

    it('should surface errors while listing all hosts', async () => {
      const querySpy = jest.spyOn(db, 'query').mockRejectedValueOnce(new Error('forced-get-all-failure'));
      try {
        await expect(hostAggregator.getAllHosts()).rejects.toThrow('forced-get-all-failure');
      } finally {
        querySpy.mockRestore();
      }
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

    it('should surface errors while listing hosts by node', async () => {
      const querySpy = jest.spyOn(db, 'query').mockRejectedValueOnce(new Error('forced-get-by-node-failure'));
      try {
        await expect(hostAggregator.getHostsByNode('test-node-5')).rejects.toThrow(
          'forced-get-by-node-failure'
        );
      } finally {
        querySpy.mockRestore();
      }
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
      const host = await hostAggregator.getHostByFQN('test-host-11@Remote%20Site-test-node-6');

      expect(host).not.toBeNull();
      expect(host!.name).toBe('test-host-11');
      expect(host!.location).toBe('Remote Site');
    });

    it('should return null for non-existent FQN', async () => {
      const host = await hostAggregator.getHostByFQN('non-existent@location');
      expect(host).toBeNull();
    });

    it('should preserve hyphens in location names (no round-trip corruption)', async () => {
      // Register test node with hyphenated location
      await NodeModel.register({
        nodeId: 'test-node-hyphen',
        name: 'Test Node Hyphen',
        location: 'sub-network',
        authToken: 'token-hyphen',
        metadata: {
          version: '1.0.0',
          platform: 'test',
          protocolVersion: PROTOCOL_VERSION,
          networkInfo: { subnet: '192.168.1.0/24', gateway: '192.168.1.1' }
        }
      });

      // Test case for issue: locations with natural hyphens like "sub-network"
      // should not be corrupted to "sub network" after round-trip
      const event = {
        nodeId: 'test-node-hyphen',
        location: 'sub-network',
        host: {
          name: 'test-host-hyphen',
          mac: 'AA:BB:CC:DD:EE:FF',
          ip: '192.168.1.250',
          status: 'awake' as const,
          lastSeen: new Date().toISOString(),
          discovered: 1,
          pingResponsive: 1,
        },
      };

      await hostAggregator.onHostDiscovered(event);
      
      // FQN should have URL-encoded location
      const host = await hostAggregator.getHostByFQN('test-host-hyphen@sub-network-test-node-hyphen');
      
      expect(host).not.toBeNull();
      expect(host!.location).toBe('sub-network'); // Original location preserved
      expect(host!.fullyQualifiedName).toBe('test-host-hyphen@sub-network-test-node-hyphen');
      
      // Clean up
      await db.query('DELETE FROM aggregated_hosts WHERE node_id = $1', ['test-node-hyphen']);
      await db.query('DELETE FROM nodes WHERE id = $1', ['test-node-hyphen']);
    });

    it('should surface errors while reading host by FQN', async () => {
      const querySpy = jest.spyOn(db, 'query').mockRejectedValueOnce(new Error('forced-get-fqn-failure'));
      try {
        await expect(hostAggregator.getHostByFQN('host@loc')).rejects.toThrow('forced-get-fqn-failure');
      } finally {
        querySpy.mockRestore();
      }
    });
  });

  describe('saveHostPortScanSnapshot', () => {
    it('persists open port snapshot and returns it while fresh', async () => {
      await hostAggregator.onHostDiscovered({
        nodeId: 'test-node-6',
        location: 'Remote Site',
        host: {
          name: 'port-cache-host',
          mac: 'AA:BB:CC:DD:EE:41',
          ip: '192.168.1.141',
          status: 'awake' as const,
          lastSeen: new Date().toISOString(),
          discovered: 1,
          pingResponsive: 1,
        },
      });

      const persisted = await hostAggregator.saveHostPortScanSnapshot(
        'port-cache-host@Remote%20Site-test-node-6',
        {
          scannedAt: new Date().toISOString(),
          openPorts: [{ port: 22, protocol: 'tcp', service: 'SSH' }],
        }
      );

      expect(persisted).toBe(true);
      const host = await hostAggregator.getHostByFQN('port-cache-host@Remote%20Site-test-node-6');
      expect(host).not.toBeNull();
      expect(host!.openPorts).toEqual([{ port: 22, protocol: 'tcp', service: 'SSH' }]);
      expect(host!.portsScannedAt).toEqual(expect.any(String));
      expect(host!.portsExpireAt).toEqual(expect.any(String));
    });

    it('hides expired cached snapshots from host payloads', async () => {
      await hostAggregator.onHostDiscovered({
        nodeId: 'test-node-6',
        location: 'Remote Site',
        host: {
          name: 'expired-port-cache-host',
          mac: 'AA:BB:CC:DD:EE:42',
          ip: '192.168.1.142',
          status: 'awake' as const,
          lastSeen: new Date().toISOString(),
          discovered: 1,
          pingResponsive: 1,
        },
      });

      const scannedAt = new Date(Date.now() - (5 * 60 * 60 * 1000)).toISOString();
      const persisted = await hostAggregator.saveHostPortScanSnapshot(
        'expired-port-cache-host@Remote%20Site-test-node-6',
        {
          scannedAt,
          openPorts: [{ port: 80, protocol: 'tcp', service: 'HTTP' }],
        }
      );

      expect(persisted).toBe(true);
      const host = await hostAggregator.getHostByFQN('expired-port-cache-host@Remote%20Site-test-node-6');
      expect(host).not.toBeNull();
      expect(host!.openPorts).toBeUndefined();
      expect(host!.portsScannedAt).toBeNull();
      expect(host!.portsExpireAt).toBeNull();
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

    it('should return zeroed stats when overall query yields no row', async () => {
      const querySpy = jest.spyOn(db, 'query')
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

      try {
        const stats = await hostAggregator.getStats();
        expect(stats).toEqual({
          total: 0,
          awake: 0,
          asleep: 0,
          byLocation: {},
        });
      } finally {
        querySpy.mockRestore();
      }
    });

    it('should surface errors while reading host stats', async () => {
      const querySpy = jest.spyOn(db, 'query').mockRejectedValueOnce(new Error('forced-get-stats-failure'));
      try {
        await expect(hostAggregator.getStats()).rejects.toThrow('forced-get-stats-failure');
      } finally {
        querySpy.mockRestore();
      }
    });
  });
});
