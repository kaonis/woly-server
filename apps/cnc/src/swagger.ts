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
            ip: {
              type: 'string',
              format: 'ipv4',
              description: 'IP address',
              example: '192.168.1.147',
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
              enum: ['wake', 'update-host', 'delete-host', 'scan', 'scan-host-ports', 'ping-host', 'ping'],
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
