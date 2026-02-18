import {
  inboundCncCommandSchema,
  outboundNodeMessageSchema,
  PROTOCOL_VERSION,
} from '@kaonis/woly-protocol';

describe('Protocol contract', () => {
  it('encodes and decodes valid outbound messages with shared schema', () => {
    const outbound = {
      type: 'register' as const,
      data: {
        nodeId: 'node-1',
        name: 'node-1',
        location: 'lab',
        authToken: 'token',
        metadata: {
          version: '0.0.1',
          platform: 'darwin',
          protocolVersion: PROTOCOL_VERSION,
          networkInfo: {
            subnet: '192.168.1.0/24',
            gateway: '192.168.1.1',
          },
        },
      },
    };

    expect(outboundNodeMessageSchema.safeParse(outbound).success).toBe(true);

    const roundTripPayload = JSON.parse(JSON.stringify(outbound));
    expect(outboundNodeMessageSchema.safeParse(roundTripPayload).success).toBe(true);
  });

  it('decodes valid inbound registered command with protocol version', () => {
    const inbound = {
      type: 'registered' as const,
      data: {
        nodeId: 'node-1',
        heartbeatInterval: 30000,
        protocolVersion: PROTOCOL_VERSION,
      },
    };

    expect(inboundCncCommandSchema.safeParse(inbound).success).toBe(true);
  });

  it('decodes valid inbound shutdown-host command payload', () => {
    const inbound = {
      type: 'shutdown-host' as const,
      commandId: 'cmd-shutdown-1',
      data: {
        hostName: 'office-pc',
        mac: 'AA:BB:CC:DD:EE:FF',
        ip: '192.168.1.20',
        confirmation: 'shutdown' as const,
      },
    };

    expect(inboundCncCommandSchema.safeParse(inbound).success).toBe(true);
  });

  it('rejects invalid inbound command payloads', () => {
    const invalidInbound = {
      type: 'wake' as const,
      data: {
        hostName: 'office-pc',
      },
    };

    expect(inboundCncCommandSchema.safeParse(invalidInbound).success).toBe(false);
  });

  it('accepts protocol error message payloads', () => {
    const protocolErrorMessage = {
      type: 'error' as const,
      message: 'Invalid protocol payload',
    };

    expect(inboundCncCommandSchema.safeParse(protocolErrorMessage).success).toBe(true);
  });
});
