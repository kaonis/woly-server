import { getTableName, initDatabase, runInitDbCli } from '../../init-db';

function createDbClientMock() {
  return {
    connect: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
    query: jest
      .fn<Promise<{ rows: unknown[]; rowCount: number }>, [string]>()
      .mockResolvedValue({ rows: [], rowCount: 0 }),
    close: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
  };
}

describe('init-db script helpers', () => {
  it('getTableName returns null for non-record input', () => {
    expect(getTableName(null)).toBeNull();
    expect(getTableName('hosts')).toBeNull();
    expect(getTableName({})).toBeNull();
    expect(getTableName({ table_name: 123 })).toBeNull();
  });

  it('getTableName extracts table_name strings', () => {
    expect(getTableName({ table_name: 'aggregated_hosts' })).toBe('aggregated_hosts');
  });

  it('initializes sqlite schema and logs discovered tables', async () => {
    const dbClient = createDbClientMock();
    dbClient.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [
          { table_name: 'aggregated_hosts' },
          { table_name: 'nodes' },
          { table_name: 100 },
        ],
        rowCount: 3,
      });

    const readFile = jest.fn().mockReturnValue('-- sqlite schema');
    const log = {
      info: jest.fn(),
      error: jest.fn(),
    };
    const exit = jest.fn();

    await initDatabase({
      dbClient,
      readFile,
      log,
      exit,
      dbType: 'sqlite',
      schemaRootDir: '/tmp/cnc',
    });

    expect(readFile).toHaveBeenCalledWith('/tmp/cnc/database/schema.sqlite.sql', 'utf-8');
    expect(dbClient.connect).toHaveBeenCalledTimes(1);
    expect(dbClient.query).toHaveBeenCalledTimes(2);
    expect(log.info).toHaveBeenCalledWith('Created tables:', {
      tables: ['aggregated_hosts', 'nodes'],
    });
    expect(dbClient.close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('initializes postgres schema and logs discovered tables', async () => {
    const dbClient = createDbClientMock();
    dbClient.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [
          { table_name: 'aggregated_hosts' },
          { table_name: 'host_wake_schedules' },
        ],
        rowCount: 2,
      });

    const readFile = jest.fn().mockReturnValue('-- postgres schema');
    const log = {
      info: jest.fn(),
      error: jest.fn(),
    };
    const exit = jest.fn();

    await initDatabase({
      dbClient,
      readFile,
      log,
      exit,
      dbType: 'postgres',
      schemaRootDir: '/tmp/cnc',
    });

    expect(readFile).toHaveBeenCalledWith('/tmp/cnc/database/schema.sql', 'utf-8');
    expect(dbClient.query).toHaveBeenCalledWith(
      expect.stringContaining('information_schema.tables'),
    );
    expect(log.info).toHaveBeenCalledWith('Created tables:', {
      tables: ['aggregated_hosts', 'host_wake_schedules'],
    });
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('logs failures and exits with status 1', async () => {
    const dbClient = createDbClientMock();
    dbClient.connect.mockRejectedValueOnce(new Error('connection failed'));

    const log = {
      info: jest.fn(),
      error: jest.fn(),
    };
    const exit = jest.fn();

    await initDatabase({
      dbClient,
      readFile: jest.fn(),
      log,
      exit,
      dbType: 'postgres',
      schemaRootDir: '/tmp/cnc',
    });

    expect(log.error).toHaveBeenCalledWith(
      'Database initialization failed',
      expect.objectContaining({
        error: expect.any(Error),
      }),
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('runInitDbCli returns null when module is not the process entrypoint', () => {
    const runner = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
    const result = runInitDbCli({ id: 'a' } as NodeModule, { id: 'b' } as NodeModule, runner);

    expect(result).toBeNull();
    expect(runner).not.toHaveBeenCalled();
  });

  it('runInitDbCli default runner path returns null when module is not the process entrypoint', () => {
    const result = runInitDbCli({ id: 'a' } as NodeModule, { id: 'b' } as NodeModule);

    expect(result).toBeNull();
  });

  it('runInitDbCli invokes provided runner when module is the process entrypoint', async () => {
    const entryModule = { id: 'entry' } as NodeModule;
    const runner = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);

    const result = runInitDbCli(entryModule, entryModule, runner);

    await expect(result).resolves.toBeUndefined();
    expect(runner).toHaveBeenCalledTimes(1);
  });
});
