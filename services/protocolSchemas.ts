import { z } from 'zod';

const hostStatusSchema = z.enum(['awake', 'asleep']);

const hostPayloadSchema = z.object({
  name: z.string().min(1),
  mac: z.string().min(1),
  ip: z.string().min(1),
  status: hostStatusSchema,
  lastSeen: z.string().nullable(),
  discovered: z.number().int(),
  pingResponsive: z.number().int().nullable().optional(),
});

const nodeMetadataSchema = z.object({
  version: z.string().min(1),
  platform: z.string().min(1),
  networkInfo: z.object({
    subnet: z.string().min(1),
    gateway: z.string().min(1),
  }),
});

const commandResultPayloadSchema = z.object({
  nodeId: z.string().min(1),
  commandId: z.string().min(1),
  success: z.boolean(),
  message: z.string().optional(),
  error: z.string().optional(),
  timestamp: z.coerce.date(),
});

export const outboundNodeMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('register'),
    data: z.object({
      nodeId: z.string().min(1),
      name: z.string().min(1),
      location: z.string().min(1),
      authToken: z.string().min(1),
      publicUrl: z.string().optional(),
      metadata: nodeMetadataSchema,
    }),
  }),
  z.object({
    type: z.literal('heartbeat'),
    data: z.object({
      nodeId: z.string().min(1),
      timestamp: z.coerce.date(),
    }),
  }),
  z.object({
    type: z.literal('host-discovered'),
    data: z
      .object({
        nodeId: z.string().min(1),
      })
      .merge(hostPayloadSchema),
  }),
  z.object({
    type: z.literal('host-updated'),
    data: z
      .object({
        nodeId: z.string().min(1),
      })
      .merge(hostPayloadSchema),
  }),
  z.object({
    type: z.literal('host-removed'),
    data: z.object({
      nodeId: z.string().min(1),
      name: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal('scan-complete'),
    data: z.object({
      nodeId: z.string().min(1),
      hostCount: z.number().int().nonnegative(),
    }),
  }),
  z.object({
    type: z.literal('command-result'),
    data: commandResultPayloadSchema,
  }),
]);

export const inboundCncCommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('registered'),
    data: z.object({
      nodeId: z.string().min(1),
      heartbeatInterval: z.number().int().positive(),
    }),
  }),
  z.object({
    type: z.literal('wake'),
    commandId: z.string().min(1),
    data: z.object({
      hostName: z.string().min(1),
      mac: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal('scan'),
    commandId: z.string().min(1),
    data: z.object({
      immediate: z.boolean(),
    }),
  }),
  z.object({
    type: z.literal('update-host'),
    commandId: z.string().min(1),
    data: z.object({
      currentName: z.string().min(1).optional(),
      name: z.string().min(1),
      mac: z.string().min(1).optional(),
      ip: z.string().min(1).optional(),
      status: hostStatusSchema.optional(),
    }),
  }),
  z.object({
    type: z.literal('delete-host'),
    commandId: z.string().min(1),
    data: z.object({
      name: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal('ping'),
    data: z.object({
      timestamp: z.coerce.date(),
    }),
  }),
]);
