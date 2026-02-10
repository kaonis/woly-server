import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'WoLy API',
      version: '0.0.1',
      description: 'Wake-on-LAN backend API for managing network hosts and remote wake-up',
      contact: {
        name: 'WoLy Backend',
        url: 'https://github.com/kaonis/woly-backend',
      },
      license: {
        name: 'Apache 2.0',
        url: 'https://www.apache.org/licenses/LICENSE-2.0.html',
      },
    },
    servers: [
      {
        url: 'http://localhost:8082',
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
            default: '8082',
            description: 'Server port',
          },
        },
      },
    ],
    tags: [
      {
        name: 'Hosts',
        description: 'Host management endpoints',
      },
      {
        name: 'Network',
        description: 'Network discovery and scanning',
      },
      {
        name: 'Wake-on-LAN',
        description: 'Remote host wake-up operations',
      },
      {
        name: 'Health',
        description: 'Service health and status',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'API Key',
          description: 'Optional API key authentication (enabled when NODE_API_KEY is set)',
        },
      },
      schemas: {
        Host: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Unique hostname',
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
              description: 'Current host status',
              example: 'awake',
            },
            lastSeen: {
              type: 'string',
              format: 'date-time',
              description: 'Last time host was detected online',
              example: '2025-11-19 09:24:30',
              nullable: true,
            },
            discovered: {
              type: 'integer',
              description: 'Whether host was discovered automatically (1) or added manually (0)',
              example: 1,
            },
            pingResponsive: {
              type: 'integer',
              description:
                'ICMP ping responsiveness: 1 (responds), 0 (no response), null (not tested)',
              example: 1,
              nullable: true,
            },
          },
          required: ['name', 'mac', 'ip', 'status'],
        },
        MacVendor: {
          type: 'object',
          properties: {
            vendor: {
              type: 'string',
              description: 'Manufacturer name',
              example: 'Apple, Inc.',
            },
            mac: {
              type: 'string',
              description: 'MAC address queried',
              example: '80:6D:97:60:39:08',
            },
          },
        },
        HealthCheck: {
          type: 'object',
          properties: {
            uptime: {
              type: 'number',
              description: 'Server uptime in seconds',
              example: 73.876685,
            },
            timestamp: {
              type: 'integer',
              description: 'Current timestamp',
              example: 1763544894939,
            },
            status: {
              type: 'string',
              enum: ['ok', 'degraded'],
              description: 'Overall system status',
              example: 'ok',
            },
            environment: {
              type: 'string',
              description: 'Current environment',
              example: 'development',
            },
            checks: {
              type: 'object',
              properties: {
                database: {
                  type: 'string',
                  enum: ['healthy', 'unhealthy', 'unknown'],
                  example: 'healthy',
                },
                networkScan: {
                  type: 'string',
                  enum: ['running', 'idle'],
                  example: 'idle',
                },
              },
            },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  description: 'Error code',
                  example: 'VALIDATION_ERROR',
                },
                message: {
                  type: 'string',
                  description: 'Human-readable error message',
                  example: 'MAC address must be in format XX:XX:XX:XX:XX:XX',
                },
                statusCode: {
                  type: 'integer',
                  description: 'HTTP status code',
                  example: 400,
                },
                timestamp: {
                  type: 'string',
                  format: 'date-time',
                  description: 'Error timestamp',
                  example: '2025-11-19T09:35:06.541Z',
                },
                path: {
                  type: 'string',
                  description: 'Request path that caused the error',
                  example: '/hosts/mac-vendor/INVALID',
                },
              },
            },
          },
        },
      },
      responses: {
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
        TooManyRequests: {
          description: 'Rate limit exceeded',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  error: {
                    type: 'string',
                    example: 'Too many requests from this IP',
                  },
                  retryAfter: {
                    type: 'string',
                    example: '15 minutes',
                  },
                },
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
  apis: ['./routes/*.ts', './controllers/*.ts', './app.ts'],
};

export const specs = swaggerJsdoc(options);
