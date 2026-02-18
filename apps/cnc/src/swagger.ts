import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'WoLy C&C API',
      version: '1.0.0',
      description: 'Command & Control backend for distributed Wake-on-LAN management across multiple network nodes',
      contact: {
        name: 'WoLy C&C Backend',
        url: 'https://github.com/kaonis/woly-server',
      },
      license: {
        name: 'Apache 2.0',
        url: 'https://www.apache.org/licenses/LICENSE-2.0.html',
      },
    },
    servers: [
      {
        url: 'http://localhost:8080',
        description: 'Development server',
      },
      {
        url: 'http://{host}:{port}',
        description: 'Custom server',
        variables: {
          host: {
            default: 'localhost',
            description: 'Server hostname',
          },
          port: {
            default: '8080',
            description: 'Server port',
          },
        },
      },
    ],
    tags: [
      {
        name: 'Health',
        description: 'Service health and status endpoints',
      },
      {
        name: 'Authentication',
        description: 'JWT token issuance',
      },
      {
        name: 'Nodes',
        description: 'Node management and monitoring',
      },
      {
        name: 'Hosts',
        description: 'Aggregated host management across nodes',
      },
      {
        name: 'Webhooks',
        description: 'Webhook registration and delivery diagnostics',
      },
      {
        name: 'Meta',
        description: 'Capability negotiation and metadata endpoints',
      },
      {
        name: 'Admin',
        description: 'Administrative operations (requires admin role)',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from /api/auth/token endpoint',
        },
      },
      schemas: {
        Node: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique node identifier',
              example: 'home-network',
            },
            location: {
              type: 'string',
              description: 'Physical or logical location of the node',
              example: 'Home Office',
            },
            status: {
              type: 'string',
              enum: ['online', 'offline'],
              description: 'Current node status',
              example: 'online',
            },
            lastHeartbeat: {
              type: 'string',
              format: 'date-time',
              description: 'Timestamp of last heartbeat received',
              example: '2026-02-09T13:00:00.000Z',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Node registration timestamp',
              example: '2026-02-09T12:00:00.000Z',
            },
            connected: {
              type: 'boolean',
              description: 'Whether node is currently connected via WebSocket',
              example: true,
            },
          },
        },
        Host: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Hostname',
              example: 'PHANTOM-MBP',
            },
            mac: {
              type: 'string',
              pattern: '^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$',
              description: 'MAC address',
              example: '80:6D:97:60:39:08',
            },
            secondaryMacs: {
              type: 'array',
              description: 'Additional known MAC addresses for the same logical host',
              items: {
                type: 'string',
                pattern: '^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$',
              },
              example: ['11:22:33:44:55:66'],
            },
            ip: {
              type: 'string',
              format: 'ipv4',
              description: 'IP address',
              example: '192.168.1.147',
            },
            wolPort: {
              type: 'integer',
              minimum: 1,
              maximum: 65535,
              description: 'Configured Wake-on-LAN UDP destination port',
              example: 9,
            },
            status: {
              type: 'string',
              enum: ['awake', 'asleep'],
              description: 'Current host status (based on ARP response)',
              example: 'awake',
            },
            lastSeen: {
              type: 'string',
              format: 'date-time',
              description: 'Last time host was detected online',
              example: '2026-02-09T13:00:00.000Z',
              nullable: true,
            },
            discovered: {
              type: 'integer',
              description: 'Whether host was discovered automatically (1) or added manually (0)',
              example: 1,
            },
            pingResponsive: {
              type: 'integer',
              description: 'ICMP ping responsiveness: 1 (responds), 0 (no response), null (not tested)',
              example: 1,
              nullable: true,
            },
            notes: {
              type: 'string',
              description: 'Optional operator notes for this host',
              example: 'Patch window Sundays 03:00 UTC',
              nullable: true,
            },
            tags: {
              type: 'array',
              description: 'Optional host tags for filtering/grouping',
              items: {
                type: 'string',
              },
              example: ['prod', 'database'],
            },
            openPorts: {
              type: 'array',
              description: 'Cached open TCP ports from the most recent per-host scan (when still fresh)',
              items: {
                type: 'object',
                properties: {
                  port: {
                    type: 'integer',
                    example: 22,
                  },
                  protocol: {
                    type: 'string',
                    enum: ['tcp'],
                    example: 'tcp',
                  },
                  service: {
                    type: 'string',
                    example: 'SSH',
                  },
                },
              },
            },
            portsScannedAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'Timestamp of the cached per-host port scan snapshot',
              example: '2026-02-17T00:00:00.000Z',
            },
            portsExpireAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'Expiration timestamp for cached open ports',
              example: '2026-02-17T04:00:00.000Z',
            },
            nodeId: {
              type: 'string',
              description: 'ID of the node managing this host',
              example: 'home-network',
            },
            location: {
              type: 'string',
              description: 'Location inherited from managing node',
              example: 'Home Office',
            },
            fqn: {
              type: 'string',
              description: 'Fully qualified name (hostname@location)',
              example: 'PHANTOM-MBP@home-network',
            },
          },
        },
        HealthCheck: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              description: 'Overall system status',
              example: 'healthy',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Current timestamp',
              example: '2026-02-09T13:00:00.000Z',
            },
            version: {
              type: 'string',
              description: 'API version',
              example: '1.0.0',
            },
            metrics: {
              type: 'object',
              description: 'Runtime observability snapshot (nodes, commands, protocol validation)',
            },
          },
        },
        TokenRequest: {
          type: 'object',
          properties: {
            role: {
              type: 'string',
              enum: ['operator', 'admin'],
              description: 'Requested role (defaults to operator)',
              example: 'operator',
            },
            sub: {
              type: 'string',
              description: 'Optional subject identifier (defaults to generated mobile UUID)',
              example: 'mobile-app-user-123',
            },
          },
        },
        TokenResponse: {
          type: 'object',
          properties: {
            token: {
              type: 'string',
              description: 'JWT bearer token',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
            expiresAt: {
              type: 'string',
              format: 'date-time',
              description: 'Token expiration timestamp',
              example: '2026-02-09T14:00:00.000Z',
            },
          },
        },
        HostStats: {
          type: 'object',
          properties: {
            total: {
              type: 'integer',
              description: 'Total number of hosts',
              example: 42,
            },
            awake: {
              type: 'integer',
              description: 'Number of hosts currently awake',
              example: 15,
            },
            asleep: {
              type: 'integer',
              description: 'Number of hosts currently asleep',
              example: 27,
            },
          },
        },
        HostStatusHistoryEntry: {
          type: 'object',
          properties: {
            hostFqn: {
              type: 'string',
              example: 'workstation@Home%20Office-node-1',
            },
            oldStatus: {
              type: 'string',
              enum: ['awake', 'asleep'],
              example: 'asleep',
            },
            newStatus: {
              type: 'string',
              enum: ['awake', 'asleep'],
              example: 'awake',
            },
            changedAt: {
              type: 'string',
              format: 'date-time',
              example: '2026-02-18T18:00:00.000Z',
            },
          },
          required: ['hostFqn', 'oldStatus', 'newStatus', 'changedAt'],
        },
        HostStatusHistoryResponse: {
          type: 'object',
          properties: {
            hostFqn: {
              type: 'string',
              example: 'workstation@Home%20Office-node-1',
            },
            from: {
              type: 'string',
              format: 'date-time',
              example: '2026-02-11T18:00:00.000Z',
            },
            to: {
              type: 'string',
              format: 'date-time',
              example: '2026-02-18T18:00:00.000Z',
            },
            entries: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/HostStatusHistoryEntry',
              },
            },
          },
          required: ['hostFqn', 'from', 'to', 'entries'],
        },
        HostUptimeSummary: {
          type: 'object',
          properties: {
            hostFqn: {
              type: 'string',
              example: 'workstation@Home%20Office-node-1',
            },
            period: {
              type: 'string',
              example: '7d',
            },
            from: {
              type: 'string',
              format: 'date-time',
              example: '2026-02-11T18:00:00.000Z',
            },
            to: {
              type: 'string',
              format: 'date-time',
              example: '2026-02-18T18:00:00.000Z',
            },
            uptimePercentage: {
              type: 'number',
              example: 99.25,
            },
            awakeMs: {
              type: 'integer',
              example: 600000000,
            },
            asleepMs: {
              type: 'integer',
              example: 4500000,
            },
            transitions: {
              type: 'integer',
              example: 4,
            },
            currentStatus: {
              type: 'string',
              enum: ['awake', 'asleep'],
              example: 'awake',
            },
          },
          required: [
            'hostFqn',
            'period',
            'from',
            'to',
            'uptimePercentage',
            'awakeMs',
            'asleepMs',
            'transitions',
            'currentStatus',
          ],
        },
        WebhookEventType: {
          type: 'string',
          enum: [
            'host.awake',
            'host.asleep',
            'host.discovered',
            'host.removed',
            'scan.complete',
            'node.connected',
            'node.disconnected',
          ],
        },
        CreateWebhookRequest: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              format: 'uri',
              example: 'https://example.com/hooks/woly',
            },
            events: {
              type: 'array',
              minItems: 1,
              items: {
                $ref: '#/components/schemas/WebhookEventType',
              },
            },
            secret: {
              type: 'string',
              nullable: true,
              example: 'shared-secret',
            },
          },
          required: ['url', 'events'],
        },
        WebhookSubscription: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: 'webhook-1',
            },
            url: {
              type: 'string',
              format: 'uri',
              example: 'https://example.com/hooks/woly',
            },
            events: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/WebhookEventType',
              },
            },
            hasSecret: {
              type: 'boolean',
              example: true,
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              example: '2026-02-18T20:00:00.000Z',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              example: '2026-02-18T20:00:00.000Z',
            },
          },
          required: ['id', 'url', 'events', 'hasSecret', 'createdAt', 'updatedAt'],
        },
        WebhooksResponse: {
          type: 'object',
          properties: {
            webhooks: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/WebhookSubscription',
              },
            },
          },
          required: ['webhooks'],
        },
        WebhookDeliveryLog: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              example: 101,
            },
            webhookId: {
              type: 'string',
              example: 'webhook-1',
            },
            eventType: {
              $ref: '#/components/schemas/WebhookEventType',
            },
            attempt: {
              type: 'integer',
              minimum: 1,
              example: 2,
            },
            status: {
              type: 'string',
              enum: ['success', 'failed'],
              example: 'failed',
            },
            responseStatus: {
              type: 'integer',
              nullable: true,
              example: 503,
            },
            error: {
              type: 'string',
              nullable: true,
              example: 'HTTP 503',
            },
            payload: {
              type: 'object',
              additionalProperties: true,
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              example: '2026-02-18T20:00:05.000Z',
            },
          },
          required: ['id', 'webhookId', 'eventType', 'attempt', 'status', 'responseStatus', 'error', 'payload', 'createdAt'],
        },
        WebhookDeliveriesResponse: {
          type: 'object',
          properties: {
            webhookId: {
              type: 'string',
              example: 'webhook-1',
            },
            deliveries: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/WebhookDeliveryLog',
              },
            },
          },
          required: ['webhookId', 'deliveries'],
        },
        DeleteWebhookResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            id: {
              type: 'string',
              example: 'webhook-1',
            },
          },
          required: ['success', 'id'],
        },
        CapabilitiesResponse: {
          type: 'object',
          properties: {
            mode: {
              type: 'string',
              enum: ['cnc'],
              example: 'cnc',
            },
            versions: {
              type: 'object',
              properties: {
                cncApi: {
                  type: 'string',
                  example: '1.0.0',
                },
                protocol: {
                  type: 'string',
                  example: '1.3.0',
                },
              },
              required: ['cncApi', 'protocol'],
            },
            capabilities: {
              type: 'object',
              additionalProperties: true,
              description: 'Capability descriptors keyed by feature name',
            },
            rateLimits: {
              type: 'object',
              additionalProperties: true,
              description: 'Optional CNC rate limit descriptors',
            },
          },
          required: ['mode', 'versions', 'capabilities'],
        },
        CommandResult: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              description: 'Whether the command succeeded',
              example: true,
            },
            message: {
              type: 'string',
              description: 'Result message',
              example: 'Wake-on-LAN packet sent successfully',
            },
            commandId: {
              type: 'string',
              description: 'Unique command identifier',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            correlationId: {
              type: 'string',
              description: 'Request correlation identifier for end-to-end tracing',
              example: 'corr_2a8f6842-6f8f-4e8f-b6dc-f7dbd9a18e68',
            },
          },
        },
        HostWakeSchedule: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: 'schedule-1',
            },
            hostFqn: {
              type: 'string',
              example: 'PHANTOM-MBP@home-network',
            },
            hostName: {
              type: 'string',
              example: 'PHANTOM-MBP',
            },
            hostMac: {
              type: 'string',
              example: '80:6D:97:60:39:08',
            },
            scheduledTime: {
              type: 'string',
              format: 'date-time',
              example: '2026-02-20T10:00:00.000Z',
            },
            frequency: {
              type: 'string',
              enum: ['once', 'daily', 'weekly', 'weekdays', 'weekends'],
              example: 'daily',
            },
            enabled: {
              type: 'boolean',
              example: true,
            },
            notifyOnWake: {
              type: 'boolean',
              example: true,
            },
            timezone: {
              type: 'string',
              example: 'UTC',
            },
            lastTriggered: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              example: '2026-02-20T10:00:03.000Z',
            },
            nextTrigger: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              example: '2026-02-21T10:00:00.000Z',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              example: '2026-02-18T00:00:00.000Z',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              example: '2026-02-18T00:00:00.000Z',
            },
          },
        },
        SystemStats: {
          type: 'object',
          properties: {
            nodes: {
              type: 'object',
              properties: {
                total: {
                  type: 'integer',
                  example: 3,
                },
                online: {
                  type: 'integer',
                  example: 2,
                },
                offline: {
                  type: 'integer',
                  example: 1,
                },
              },
            },
            hosts: {
              $ref: '#/components/schemas/HostStats',
            },
            websocket: {
              type: 'object',
              properties: {
                connectedNodes: {
                  type: 'integer',
                  example: 2,
                },
                protocolValidationFailures: {
                  type: 'object',
                  additionalProperties: {
                    type: 'integer',
                  },
                },
              },
            },
            observability: {
              type: 'object',
              description: 'Runtime observability snapshot used by dashboards and alerts',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              example: '2026-02-09T13:00:00.000Z',
            },
          },
        },
        Command: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Command ID',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            type: {
              type: 'string',
              enum: [
                'wake',
                'update-host',
                'delete-host',
                'scan',
                'scan-host-ports',
                'ping-host',
                'sleep-host',
                'shutdown-host',
                'ping',
              ],
              description: 'Command type',
              example: 'wake',
            },
            nodeId: {
              type: 'string',
              description: 'Target node ID',
              example: 'home-network',
            },
            status: {
              type: 'string',
              enum: ['pending', 'completed', 'failed', 'timeout'],
              description: 'Command status',
              example: 'completed',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              example: '2026-02-09T13:00:00.000Z',
            },
            completedAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              example: '2026-02-09T13:00:05.000Z',
            },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error type',
              example: 'Not Found',
            },
            message: {
              type: 'string',
              description: 'Human-readable error message',
              example: 'Host PHANTOM-MBP@home-network not found',
            },
            code: {
              type: 'string',
              description: 'Error code (for authentication errors)',
              example: 'AUTH_UNAUTHORIZED',
            },
          },
        },
      },
      responses: {
        Unauthorized: {
          description: 'Missing or invalid authentication',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
        Forbidden: {
          description: 'Authenticated but not authorized for this operation',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
        BadRequest: {
          description: 'Invalid request parameters',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
        NotFound: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
        ServiceUnavailable: {
          description: 'Service unavailable (e.g., node offline)',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
        GatewayTimeout: {
          description: 'Command timeout',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
        InternalError: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts', './src/server.ts'],
};

export const specs = swaggerJsdoc(options);
