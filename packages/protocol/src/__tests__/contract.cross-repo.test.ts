/**
 * Cross-repo protocol contract tests
 *
 * These tests validate that both node-agent and cnc backends can successfully
 * encode and decode messages using the shared protocol package. This ensures
 * protocol compatibility across the distributed system.
 *
 * Test coverage:
 * - All message types (node → C&C)
 * - All command types (C&C → node)
 * - JSON serialization/deserialization round-trips
 * - Protocol version negotiation
 * - Error handling for incompatible messages
 */

import {
  inboundCncCommandSchema,
  outboundNodeMessageSchema,
  PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '../index';

describe('Cross-repo protocol contract', () => {
  describe('Node → C&C message encoding/decoding', () => {
    describe('register message', () => {
      it('successfully round-trips through JSON serialization', () => {
        const message = {
          type: 'register' as const,
          data: {
            nodeId: 'node-lab-01',
            name: 'Lab Node 1',
            location: 'office-building-a',
            authToken: 'test-token-12345',
            metadata: {
              version: '0.0.1',
              platform: 'linux',
              protocolVersion: PROTOCOL_VERSION,
              networkInfo: {
                subnet: '192.168.1.0/24',
                gateway: '192.168.1.1',
              },
            },
          },
        };

        // Validate outbound message
        const validationResult = outboundNodeMessageSchema.safeParse(message);
        expect(validationResult.success).toBe(true);

        // Simulate network transmission (JSON encode/decode)
        const serialized = JSON.stringify(message);
        const deserialized = JSON.parse(serialized);

        // Validate deserialized message
        const deserializedResult = outboundNodeMessageSchema.safeParse(deserialized);
        expect(deserializedResult.success).toBe(true);

        // Verify data integrity
        if (deserializedResult.success && deserializedResult.data.type === 'register') {
          expect(deserializedResult.data.type).toBe('register');
          expect(deserializedResult.data.data.nodeId).toBe('node-lab-01');
          expect(deserializedResult.data.data.metadata.protocolVersion).toBe(PROTOCOL_VERSION);
        }
      });

      it('validates protocol version is present and supported', () => {
        const message = {
          type: 'register' as const,
          data: {
            nodeId: 'node-1',
            name: 'Test Node',
            location: 'test',
            metadata: {
              version: '1.0.0',
              platform: 'linux',
              protocolVersion: PROTOCOL_VERSION,
              networkInfo: {
                subnet: '10.0.0.0/24',
                gateway: '10.0.0.1',
              },
            },
          },
        };

        const result = outboundNodeMessageSchema.safeParse(message);
        expect(result.success).toBe(true);

        if (result.success && result.data.type === 'register') {
          expect(SUPPORTED_PROTOCOL_VERSIONS).toContain(
            result.data.data.metadata.protocolVersion,
          );
        }
      });
    });

    describe('heartbeat message', () => {
      it('successfully round-trips with timestamp coercion', () => {
        const message = {
          type: 'heartbeat' as const,
          data: {
            nodeId: 'node-1',
            timestamp: new Date().toISOString(),
          },
        };

        const validationResult = outboundNodeMessageSchema.safeParse(message);
        expect(validationResult.success).toBe(true);

        // Simulate network transmission
        const serialized = JSON.stringify(message);
        const deserialized = JSON.parse(serialized);

        const deserializedResult = outboundNodeMessageSchema.safeParse(deserialized);
        expect(deserializedResult.success).toBe(true);

        if (deserializedResult.success && deserializedResult.data.type === 'heartbeat') {
          expect(deserializedResult.data.type).toBe('heartbeat');
          expect(deserializedResult.data.data.timestamp).toBeInstanceOf(Date);
        }
      });
    });

    describe('host-discovered message', () => {
      it('successfully encodes full host data with all optional fields', () => {
        const message = {
          type: 'host-discovered' as const,
          data: {
            nodeId: 'node-1',
            name: 'workstation-01',
            mac: 'AA:BB:CC:DD:EE:FF',
            ip: '192.168.1.100',
            status: 'awake' as const,
            lastSeen: new Date().toISOString(),
            discovered: 1,
            pingResponsive: 1,
          },
        };

        const result = outboundNodeMessageSchema.safeParse(message);
        expect(result.success).toBe(true);

        // Verify JSON round-trip
        const roundTrip = outboundNodeMessageSchema.safeParse(
          JSON.parse(JSON.stringify(message)),
        );
        expect(roundTrip.success).toBe(true);
      });

      it('successfully encodes host data without optional pingResponsive', () => {
        const message = {
          type: 'host-discovered' as const,
          data: {
            nodeId: 'node-1',
            name: 'workstation-02',
            mac: '11:22:33:44:55:66',
            ip: '192.168.1.101',
            status: 'asleep' as const,
            lastSeen: null,
            discovered: 0,
          },
        };

        const result = outboundNodeMessageSchema.safeParse(message);
        expect(result.success).toBe(true);
      });
    });

    describe('host-updated message', () => {
      it('successfully encodes status changes', () => {
        const message = {
          type: 'host-updated' as const,
          data: {
            nodeId: 'node-1',
            name: 'server-01',
            mac: 'AA:BB:CC:DD:EE:FF',
            ip: '192.168.1.50',
            status: 'awake' as const,
            lastSeen: new Date().toISOString(),
            discovered: 1,
            pingResponsive: 1,
          },
        };

        const result = outboundNodeMessageSchema.safeParse(message);
        expect(result.success).toBe(true);

        // Verify round-trip maintains status
        const roundTrip = outboundNodeMessageSchema.safeParse(
          JSON.parse(JSON.stringify(message)),
        );
        expect(roundTrip.success).toBe(true);
        if (roundTrip.success && roundTrip.data.type === 'host-updated') {
          expect(roundTrip.data.data.status).toBe('awake');
        }
      });
    });

    describe('host-removed message', () => {
      it('successfully encodes host removal', () => {
        const message = {
          type: 'host-removed' as const,
          data: {
            nodeId: 'node-1',
            name: 'old-device',
          },
        };

        const result = outboundNodeMessageSchema.safeParse(message);
        expect(result.success).toBe(true);

        const roundTrip = outboundNodeMessageSchema.safeParse(
          JSON.parse(JSON.stringify(message)),
        );
        expect(roundTrip.success).toBe(true);
      });
    });

    describe('scan-complete message', () => {
      it('successfully encodes scan results', () => {
        const message = {
          type: 'scan-complete' as const,
          data: {
            nodeId: 'node-1',
            hostCount: 42,
          },
        };

        const result = outboundNodeMessageSchema.safeParse(message);
        expect(result.success).toBe(true);

        const roundTrip = outboundNodeMessageSchema.safeParse(
          JSON.parse(JSON.stringify(message)),
        );
        expect(roundTrip.success).toBe(true);
        if (roundTrip.success && roundTrip.data.type === 'scan-complete') {
          expect(roundTrip.data.data.hostCount).toBe(42);
        }
      });
    });

    describe('command-result message', () => {
      it('successfully encodes successful command results', () => {
        const message = {
          type: 'command-result' as const,
          data: {
            nodeId: 'node-1',
            commandId: 'cmd-12345',
            success: true,
            message: 'Wake-on-LAN packet sent successfully',
            timestamp: new Date().toISOString(),
          },
        };

        const result = outboundNodeMessageSchema.safeParse(message);
        expect(result.success).toBe(true);

        const roundTrip = outboundNodeMessageSchema.safeParse(
          JSON.parse(JSON.stringify(message)),
        );
        expect(roundTrip.success).toBe(true);
        if (roundTrip.success && roundTrip.data.type === 'command-result') {
          expect(roundTrip.data.data.success).toBe(true);
        }
      });

      it('successfully encodes failed command results', () => {
        const message = {
          type: 'command-result' as const,
          data: {
            nodeId: 'node-1',
            commandId: 'cmd-67890',
            success: false,
            error: 'Host not found',
            timestamp: new Date().toISOString(),
          },
        };

        const result = outboundNodeMessageSchema.safeParse(message);
        expect(result.success).toBe(true);

        const roundTrip = outboundNodeMessageSchema.safeParse(
          JSON.parse(JSON.stringify(message)),
        );
        expect(roundTrip.success).toBe(true);
        if (roundTrip.success && roundTrip.data.type === 'command-result') {
          expect(roundTrip.data.data.success).toBe(false);
          expect(roundTrip.data.data.error).toBe('Host not found');
        }
      });
    });
  });

  describe('C&C → Node command encoding/decoding', () => {
    describe('registered command', () => {
      it('successfully encodes registration acknowledgement', () => {
        const command = {
          type: 'registered' as const,
          data: {
            nodeId: 'node-1',
            heartbeatInterval: 30000,
            protocolVersion: PROTOCOL_VERSION,
          },
        };

        const result = inboundCncCommandSchema.safeParse(command);
        expect(result.success).toBe(true);

        const roundTrip = inboundCncCommandSchema.safeParse(
          JSON.parse(JSON.stringify(command)),
        );
        expect(roundTrip.success).toBe(true);
        if (roundTrip.success && roundTrip.data.type === 'registered') {
          expect(roundTrip.data.data.protocolVersion).toBe(PROTOCOL_VERSION);
        }
      });

      it('validates heartbeat interval is positive', () => {
        const invalidCommand = {
          type: 'registered' as const,
          data: {
            nodeId: 'node-1',
            heartbeatInterval: 0,
          },
        };

        const result = inboundCncCommandSchema.safeParse(invalidCommand);
        expect(result.success).toBe(false);
      });
    });

    describe('wake command', () => {
      it('successfully encodes wake-on-lan commands', () => {
        const command = {
          type: 'wake' as const,
          commandId: 'cmd-wake-001',
          data: {
            hostName: 'desktop-gaming',
            mac: 'AA:BB:CC:DD:EE:FF',
          },
        };

        const result = inboundCncCommandSchema.safeParse(command);
        expect(result.success).toBe(true);

        const roundTrip = inboundCncCommandSchema.safeParse(
          JSON.parse(JSON.stringify(command)),
        );
        expect(roundTrip.success).toBe(true);
        if (roundTrip.success && roundTrip.data.type === 'wake') {
          expect(roundTrip.data.commandId).toBe('cmd-wake-001');
          expect(roundTrip.data.data.mac).toBe('AA:BB:CC:DD:EE:FF');
        }
      });

      it('rejects wake command without required mac address', () => {
        const invalidCommand = {
          type: 'wake' as const,
          commandId: 'cmd-wake-002',
          data: {
            hostName: 'desktop-gaming',
          },
        };

        const result = inboundCncCommandSchema.safeParse(invalidCommand);
        expect(result.success).toBe(false);
      });
    });

    describe('scan command', () => {
      it('successfully encodes immediate scan commands', () => {
        const command = {
          type: 'scan' as const,
          commandId: 'cmd-scan-001',
          data: {
            immediate: true,
          },
        };

        const result = inboundCncCommandSchema.safeParse(command);
        expect(result.success).toBe(true);

        const roundTrip = inboundCncCommandSchema.safeParse(
          JSON.parse(JSON.stringify(command)),
        );
        expect(roundTrip.success).toBe(true);
      });

      it('successfully encodes scheduled scan commands', () => {
        const command = {
          type: 'scan' as const,
          commandId: 'cmd-scan-002',
          data: {
            immediate: false,
          },
        };

        const result = inboundCncCommandSchema.safeParse(command);
        expect(result.success).toBe(true);
      });
    });

    describe('update-host command', () => {
      it('successfully encodes full host update', () => {
        const command = {
          type: 'update-host' as const,
          commandId: 'cmd-update-001',
          data: {
            currentName: 'old-hostname',
            name: 'new-hostname',
            mac: '11:22:33:44:55:66',
            ip: '192.168.1.200',
            status: 'awake' as const,
          },
        };

        const result = inboundCncCommandSchema.safeParse(command);
        expect(result.success).toBe(true);

        const roundTrip = inboundCncCommandSchema.safeParse(
          JSON.parse(JSON.stringify(command)),
        );
        expect(roundTrip.success).toBe(true);
      });

      it('successfully encodes partial host update (name only)', () => {
        const command = {
          type: 'update-host' as const,
          commandId: 'cmd-update-002',
          data: {
            name: 'renamed-device',
          },
        };

        const result = inboundCncCommandSchema.safeParse(command);
        expect(result.success).toBe(true);
      });
    });

    describe('delete-host command', () => {
      it('successfully encodes host deletion', () => {
        const command = {
          type: 'delete-host' as const,
          commandId: 'cmd-delete-001',
          data: {
            name: 'device-to-remove',
          },
        };

        const result = inboundCncCommandSchema.safeParse(command);
        expect(result.success).toBe(true);

        const roundTrip = inboundCncCommandSchema.safeParse(
          JSON.parse(JSON.stringify(command)),
        );
        expect(roundTrip.success).toBe(true);
      });
    });

    describe('ping command', () => {
      it('successfully encodes ping with timestamp coercion', () => {
        const command = {
          type: 'ping' as const,
          data: {
            timestamp: new Date().toISOString(),
          },
        };

        const result = inboundCncCommandSchema.safeParse(command);
        expect(result.success).toBe(true);

        const roundTrip = inboundCncCommandSchema.safeParse(
          JSON.parse(JSON.stringify(command)),
        );
        expect(roundTrip.success).toBe(true);
        if (roundTrip.success && roundTrip.data.type === 'ping') {
          expect(roundTrip.data.data.timestamp).toBeInstanceOf(Date);
        }
      });
    });

    describe('error command', () => {
      it('successfully encodes protocol errors', () => {
        const command = {
          type: 'error' as const,
          message: 'Invalid message format received',
        };

        const result = inboundCncCommandSchema.safeParse(command);
        expect(result.success).toBe(true);

        const roundTrip = inboundCncCommandSchema.safeParse(
          JSON.parse(JSON.stringify(command)),
        );
        expect(roundTrip.success).toBe(true);
      });
    });
  });

  describe('Protocol version compatibility', () => {
    it('exports current protocol version', () => {
      expect(PROTOCOL_VERSION).toBeDefined();
      expect(typeof PROTOCOL_VERSION).toBe('string');
      expect(PROTOCOL_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('exports supported protocol versions array', () => {
      expect(SUPPORTED_PROTOCOL_VERSIONS).toBeDefined();
      expect(Array.isArray(SUPPORTED_PROTOCOL_VERSIONS)).toBe(true);
      expect(SUPPORTED_PROTOCOL_VERSIONS.length).toBeGreaterThan(0);
    });

    it('current protocol version is in supported versions', () => {
      expect(SUPPORTED_PROTOCOL_VERSIONS).toContain(PROTOCOL_VERSION);
    });

    it('all supported versions follow semver format', () => {
      const semverRegex = /^\d+\.\d+\.\d+$/;
      SUPPORTED_PROTOCOL_VERSIONS.forEach((version) => {
        expect(version).toMatch(semverRegex);
      });
    });
  });

  describe('Error handling and edge cases', () => {
    it('rejects messages with unknown type', () => {
      const invalidMessage = {
        type: 'unknown-message-type',
        data: { some: 'data' },
      };

      const result = outboundNodeMessageSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
    });

    it('rejects commands with unknown type', () => {
      const invalidCommand = {
        type: 'unknown-command-type',
        data: { some: 'data' },
      };

      const result = inboundCncCommandSchema.safeParse(invalidCommand);
      expect(result.success).toBe(false);
    });

    it('rejects messages with missing required fields', () => {
      const invalidMessage = {
        type: 'register',
        data: {
          nodeId: 'node-1',
          // Missing required fields: name, location, metadata
        },
      };

      const result = outboundNodeMessageSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
    });

    it('rejects commands with invalid data types', () => {
      const invalidCommand = {
        type: 'registered',
        data: {
          nodeId: 'node-1',
          heartbeatInterval: 'not-a-number', // Should be number
        },
      };

      const result = inboundCncCommandSchema.safeParse(invalidCommand);
      expect(result.success).toBe(false);
    });

    it('handles null values appropriately in host data', () => {
      const messageWithNulls = {
        type: 'host-updated' as const,
        data: {
          nodeId: 'node-1',
          name: 'device-1',
          mac: 'AA:BB:CC:DD:EE:FF',
          ip: '192.168.1.1',
          status: 'asleep' as const,
          lastSeen: null, // Allowed null
          discovered: 0,
          pingResponsive: null, // Allowed null
        },
      };

      const result = outboundNodeMessageSchema.safeParse(messageWithNulls);
      expect(result.success).toBe(true);
    });
  });

  describe('Data integrity across serialization', () => {
    it('preserves all message fields after JSON round-trip', () => {
      const originalMessage = {
        type: 'host-discovered' as const,
        data: {
          nodeId: 'node-test-1',
          name: 'test-device',
          mac: 'AA:BB:CC:DD:EE:FF',
          ip: '10.0.0.100',
          status: 'awake' as const,
          lastSeen: '2026-02-14T10:00:00.000Z',
          discovered: 1,
          pingResponsive: 1,
        },
      };

      const serialized = JSON.stringify(originalMessage);
      const deserialized = JSON.parse(serialized);
      const validated = outboundNodeMessageSchema.safeParse(deserialized);

      expect(validated.success).toBe(true);
      if (validated.success && validated.data.type === 'host-discovered') {
        expect(validated.data.type).toBe(originalMessage.type);
        expect(validated.data.data.nodeId).toBe(originalMessage.data.nodeId);
        expect(validated.data.data.name).toBe(originalMessage.data.name);
        expect(validated.data.data.mac).toBe(originalMessage.data.mac);
        expect(validated.data.data.ip).toBe(originalMessage.data.ip);
        expect(validated.data.data.status).toBe(originalMessage.data.status);
        expect(validated.data.data.discovered).toBe(originalMessage.data.discovered);
        expect(validated.data.data.pingResponsive).toBe(originalMessage.data.pingResponsive);
      }
    });

    it('preserves all command fields after JSON round-trip', () => {
      const originalCommand = {
        type: 'wake' as const,
        commandId: 'test-cmd-123',
        data: {
          hostName: 'gaming-pc',
          mac: '11:22:33:44:55:66',
        },
      };

      const serialized = JSON.stringify(originalCommand);
      const deserialized = JSON.parse(serialized);
      const validated = inboundCncCommandSchema.safeParse(deserialized);

      expect(validated.success).toBe(true);
      if (validated.success && validated.data.type === 'wake') {
        expect(validated.data.type).toBe(originalCommand.type);
        expect(validated.data.commandId).toBe(originalCommand.commandId);
        expect(validated.data.data.hostName).toBe(originalCommand.data.hostName);
        expect(validated.data.data.mac).toBe(originalCommand.data.mac);
      }
    });
  });
});
