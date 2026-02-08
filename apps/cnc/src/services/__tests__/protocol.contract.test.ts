import {
  inboundCncCommandSchema,
  outboundNodeMessageSchema,
  PROTOCOL_VERSION,
} from '@kaonis/woly-protocol';

describe('Shared protocol contract', () => {
  it('accepts valid node registration payloads', () => {
    const message = {
      type: 'register' as const,
      data: {
        nodeId: 'node-1',
        name: 'node-1',
        location: 'lab',
        authToken: 'token',
        metadata: {
          version: '1.0.0',
          platform: 'linux',
          protocolVersion: PROTOCOL_VERSION,
          networkInfo: {
            subnet: '192.168.1.0/24',
            gateway: '192.168.1.1',
          },
        },
      },
    };

    expect(outboundNodeMessageSchema.safeParse(message).success).toBe(true);
  });

  it('accepts valid outbound C&C command payloads', () => {
    const command = {
      type: 'wake' as const,
      commandId: 'cmd-1',
      data: {
        hostName: 'office-pc',
        mac: 'AA:BB:CC:DD:EE:FF',
      },
    };

    expect(inboundCncCommandSchema.safeParse(command).success).toBe(true);
  });

  it('rejects malformed wake command payload', () => {
    const invalidCommand = {
      type: 'wake' as const,
      commandId: 'cmd-2',
      data: {
        hostName: 'office-pc',
      },
    };

    expect(inboundCncCommandSchema.safeParse(invalidCommand).success).toBe(false);
  });

  it('accepts protocol error messages from C&C', () => {
    const message = {
      type: 'error' as const,
      message: 'Invalid protocol payload',
    };

    expect(inboundCncCommandSchema.safeParse(message).success).toBe(true);
  });
});
