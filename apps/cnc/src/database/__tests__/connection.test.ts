export {};

type MockPgPool = {
  connect: jest.Mock;
  query: jest.Mock;
  end: jest.Mock;
  on: jest.Mock;
};

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

async function loadConnectionModule(
  dbType: 'postgres' | 'sqlite',
  overrides?: Partial<MockPgPool>
): Promise<{
  db: {
    isSqlite: boolean;
    connect: () => Promise<void>;
    query: <T = unknown>(text: string, params?: unknown[]) => Promise<{ rows: T[]; rowCount: number }>;
    getClient: () => Promise<unknown>;
    getPool: () => unknown;
    close: () => Promise<void>;
  };
  Pool: jest.Mock;
  pool: MockPgPool;
  poolClient: { release: jest.Mock };
  SqliteDatabaseCtor: jest.Mock;
  sqliteInstance: {
    isSqlite: boolean;
    connect: jest.Mock;
    query: jest.Mock;
    getClient: jest.Mock;
    getPool: jest.Mock;
    close: jest.Mock;
  };
}> {
  jest.resetModules();

  const poolClient = { release: jest.fn() };
  const pool: MockPgPool = {
    connect: jest.fn().mockResolvedValue(poolClient),
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    end: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    ...overrides,
  };

  const Pool = jest.fn(() => pool);
  const sqliteInstance = {
    isSqlite: true,
    connect: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    getClient: jest.fn().mockResolvedValue({ query: jest.fn(), release: jest.fn() }),
    getPool: jest.fn().mockReturnValue({}),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const SqliteDatabaseCtor = jest.fn(() => sqliteInstance);

  jest.doMock('../../config', () => ({
    __esModule: true,
    default: {
      dbType,
      databaseUrl: 'postgres://localhost:5432/woly_test',
    },
  }));
  jest.doMock('../../utils/logger', () => ({
    __esModule: true,
    default: mockLogger,
  }));
  jest.doMock('pg', () => ({ Pool }));
  jest.doMock('../sqlite-connection', () => ({
    __esModule: true,
    default: SqliteDatabaseCtor,
  }));

  const connectionModule = await import('../connection');

  return {
    db: connectionModule.default,
    Pool,
    pool,
    poolClient,
    SqliteDatabaseCtor,
    sqliteInstance,
  };
}

describe('database connection factory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger.info.mockReset();
    mockLogger.error.mockReset();
    mockLogger.debug.mockReset();
  });

  afterEach(() => {
    jest.dontMock('../../config');
    jest.dontMock('../../utils/logger');
    jest.dontMock('../sqlite-connection');
    jest.dontMock('pg');
  });

  it('creates a SQLite database instance when DB_TYPE is sqlite', async () => {
    const { db, Pool, SqliteDatabaseCtor, sqliteInstance } = await loadConnectionModule('sqlite');

    expect(SqliteDatabaseCtor).toHaveBeenCalledTimes(1);
    expect(Pool).not.toHaveBeenCalled();
    expect(db.isSqlite).toBe(true);
    expect(db).toBe(sqliteInstance);
  });

  it('creates PostgreSQL database and supports connect/query/client/pool/close operations', async () => {
    const { db, Pool, pool, poolClient } = await loadConnectionModule('postgres');

    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString: 'postgres://localhost:5432/woly_test',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      })
    );
    expect(db.isSqlite).toBe(false);

    const errorHandlerCall = pool.on.mock.calls.find(([event]) => event === 'error');
    expect(errorHandlerCall).toBeDefined();
    const onPoolError = errorHandlerCall?.[1] as ((error: Error) => void) | undefined;
    expect(onPoolError).toBeDefined();
    onPoolError?.(new Error('idle client panic'));
    expect(mockLogger.error).toHaveBeenCalledWith('Unexpected error on idle client', {
      error: 'idle client panic',
    });

    await db.connect();
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(poolClient.release).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith('PostgreSQL database connected successfully');

    pool.query.mockResolvedValueOnce({ rows: [{ ok: true }], rowCount: 1 });
    const queryResult = await db.query<{ ok: boolean }>('SELECT $1', [1]);
    expect(queryResult).toEqual({ rows: [{ ok: true }], rowCount: 1 });
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Executed query',
      expect.objectContaining({
        text: 'SELECT $1',
        rows: 1,
      })
    );

    const queryError = new Error('query failed');
    pool.query.mockRejectedValueOnce(queryError);
    await expect(db.query('SELECT explode()')).rejects.toThrow('query failed');
    expect(mockLogger.error).toHaveBeenCalledWith('Query error', {
      text: 'SELECT explode()',
      error: queryError,
    });

    const client = await db.getClient();
    expect(client).toBe(poolClient);
    expect(db.getPool()).toBe(pool);

    await db.close();
    expect(pool.end).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith('PostgreSQL database connection closed');
  });

  it('logs and rethrows PostgreSQL connect failures', async () => {
    const connectError = new Error('connection refused');
    const { db } = await loadConnectionModule('postgres', {
      connect: jest.fn().mockRejectedValue(connectError),
    });

    await expect(db.connect()).rejects.toThrow('connection refused');
    expect(mockLogger.error).toHaveBeenCalledWith('Failed to connect to PostgreSQL database', {
      error: connectError,
    });
  });
});
